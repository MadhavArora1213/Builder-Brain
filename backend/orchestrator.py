"""Grizon AI agent orchestration.

Manager -> (Question | Planner) -> Approval -> Coding -> Sandbox -> Testing loop.
The build/test loop is a LangGraph StateGraph run in a background task.
"""
import asyncio
import re
import uuid
from datetime import datetime, timezone
from typing import TypedDict, List

from sqlalchemy import select, update, delete, func
from langgraph.graph import StateGraph, END

import llm
import mcp_client as mcp
import config
from db import AsyncSessionLocal, log_event
from models import Project, Message, ProjectFile, Skill, User, WorkflowRun, SandboxSession, AgentExecution

MAX_RETRIES = 2
_running_tasks: dict = {}


def now_iso():
    return datetime.utcnow().isoformat()


def _row_to_dict(row):
    if row is None:
        return None
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        elif isinstance(val, dict):
            val = dict(val) if val else {}
        elif isinstance(val, list):
            val = list(val) if val else []
        d[col.name] = val
    return d


async def add_message(project, role, mtype="text", content="", agent=None, data=None):
    msg_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as session:
        message = Message(
            id=msg_id,
            project_id=project["id"],
            conversation_id=project.get("conversation_id"),
            user_id=project["owner_id"],
            role=role,
            agent=agent,
            type=mtype,
            content=content,
            data=data or {},
            created_at=datetime.utcnow(),
        )
        session.add(message)
        await session.commit()
    return {
        "id": msg_id, "project_id": project["id"], "role": role,
        "agent": agent, "type": mtype, "content": content,
        "data": data or {}, "created_at": now_iso(),
    }


async def set_workflow(project_id, **fields):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).filter(Project.id == project_id))
        project = result.scalars().first()
        if project:
            wf = dict(project.workflow) if project.workflow else {}
            for k, v in fields.items():
                wf[k] = v
            project.workflow = wf
            project.updated_at = datetime.utcnow()
            await session.commit()


async def get_project(project_id):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Project).filter(Project.id == project_id))
        project = result.scalars().first()
        if not project:
            return None
        d = _row_to_dict(project)
        wf = d.get("workflow") or {}
        secrets = d.get("secrets") or {}
        d["workflow"] = wf
        d["secrets"] = secrets
        return d


# --------------------------------------------------------------------------
# Skills
# --------------------------------------------------------------------------
async def get_skills_for(agent_name: str) -> str:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Skill).filter(Skill.enabled == True)
        )
        skills = result.scalars().all()
    matching = []
    for s in skills:
        agents = s.agents or []
        if agent_name in agents:
            matching.append(s)
    if not matching:
        return ""
    parts = [f"### SKILL: {s.name}\n{s.content or ''}" for s in matching]
    return "\n\n".join(parts)


# --------------------------------------------------------------------------
# Manager Agent
# --------------------------------------------------------------------------
MANAGER_SYS = """You are the Manager Agent of Grizon AI, an autonomous full-stack app builder.
Classify the user's request and decide the next step. You never write code yourself.
Return JSON with this exact shape:
{
  "intent": "NEW" | "MODIFY" | "CHAT",
  "needs_clarification": true | false,
  "reply": "short conversational reply (only for CHAT)",
  "requirements_summary": "concise summary of what the user wants built or changed"
}
Rules:
- NEW = build a brand new application. MODIFY = change an existing project. CHAT = greeting/question, no build.
- Set needs_clarification true ONLY when critical info is genuinely missing to build a NEW app safely
  (e.g. persistence/database, auth, external API keys, payment provider).
- For MODIFY of an existing project, set needs_clarification false unless the change itself is ambiguous
  (e.g. "change the color" with no color given)."""


async def manager_classify(project, user_message, existing_summary, has_build):
    ctx = f"Existing project: {'yes, already built' if has_build else 'no'}.\n"
    if existing_summary:
        ctx += f"Prior requirements: {existing_summary}\n"
    ctx += f"User message: {user_message}"
    model, provider = await config.get_agent_model("manager")
    data, raw = await llm.chat_json(MANAGER_SYS, ctx, model=model, provider=provider)
    if not data:
        data = {"intent": "NEW", "needs_clarification": False,
                "reply": "", "requirements_summary": user_message}
    return data


# --------------------------------------------------------------------------
# Question Agent
# --------------------------------------------------------------------------
QUESTION_SYS = """You are the Question Agent of Grizon AI. Produce ONLY the essential clarifying
questions needed to safely build the requested app. Prefer MULTIPLE CHOICE. Ask at most 4 questions,
fewer if possible. Skip anything already clear from the requirements.

Mandatory rules:
- If the app needs to store/persist data (any CRUD, accounts, saved items), include ONE database
  question of type "choice" with options ["SQLite","PostgreSQL","In-memory / localStorage (no database)"].
- If the app needs an external API or third-party service (e.g. a chatbot needing an LLM API key,
  payments, email, maps, weather), include a question of type "secret" asking the user to paste that
  API key. Set its "key" to a clean UPPER_SNAKE env name (e.g. OPENAI_API_KEY). The key will be stored
  securely and injected into the backend only, never the frontend.
- For yes/no needs (auth? admin panel? dark mode?), use type "choice" with options ["Yes","No"].
- If a modification is ambiguous (e.g. "change color"), ask a focused choice/text question.

Return ONLY JSON:
{
  "needs_clarification": true | false,
  "questions": [
    {"key": "auth", "question": "Do you need user authentication?", "type": "choice", "options": ["Yes","No"], "required": true},
    {"key": "OPENAI_API_KEY", "question": "Paste your OpenAI API key (stored securely, backend only)", "type": "secret", "required": false}
  ]
}
type is one of "choice" | "text" | "secret". If nothing needs asking, return needs_clarification false and an empty questions array."""


async def question_agent(requirements, is_modify=False):
    prompt = f"{'MODIFICATION' if is_modify else 'NEW APP'} requirements:\n{requirements}"
    model, provider = await config.get_agent_model("question")
    data, raw = await llm.chat_json(QUESTION_SYS, prompt, model=model, provider=provider)
    if not data:
        return {"needs_clarification": False, "questions": []}
    return data


# --------------------------------------------------------------------------
# Planner Agent
# --------------------------------------------------------------------------
PLANNER_SYS = """You are the Planner Agent of Grizon AI. Convert confirmed requirements into a
structured implementation plan. Inspect the existing project when modifying; do NOT redesign it.
Return ONLY JSON:
{
  "goal": "string",
  "architecture": {"frontend": "string", "backend": "string"},
  "technology": ["string"],
  "components": ["string"],
  "database": {"required": true, "tables": ["string"]},
  "tasks": [{"id": "task-1", "title": "string", "description": "string"}],
  "dependencies": ["string"]
}
Default stack: React + Vite + TypeScript frontend, Express + TypeScript backend, unless the user
explicitly asks for Next.js or something else. Keep tasks concrete and ordered (5-9 tasks)."""


async def planner_run(requirements, existing_files_summary=""):
    prompt = f"Requirements:\n{requirements}\n"
    if existing_files_summary:
        prompt += f"\nExisting project files:\n{existing_files_summary}\nModify minimally."
    model, provider = await config.get_agent_model("planner")
    data, raw = await llm.chat_json(PLANNER_SYS, prompt, model=model, provider=provider)
    if not data:
        data = {"goal": requirements, "architecture": {"frontend": "React/Vite", "backend": "Express"},
                "technology": ["TypeScript", "React", "Tailwind CSS", "Express"],
                "components": [], "database": {"required": False, "tables": []},
                "tasks": [{"id": "task-1", "title": "Build application", "description": requirements}],
                "dependencies": []}
    return data


# --------------------------------------------------------------------------
# Public entry: handle a user message
# --------------------------------------------------------------------------
async def handle_user_message(project, content):
    await add_message(project, "user", "text", content)
    wf = project.get("workflow", {})
    status = wf.get("status", "idle")
    has_build = bool(project.get("preview_url"))

    if status in ("building", "testing"):
        await add_message(project, "system", "status",
                          "A build is currently running. Use Stop to pause before sending new instructions.")
        return {"status": status}

    # User is answering the Question Agent (free text fallback)
    if status == "asking":
        combined = (wf.get("requirements", "") + "\n\nUser answers: " + content).strip()
        await set_workflow(project["id"], requirements=combined, status="planning")
        return await _do_plan(project, combined, has_build, has_build)

    # Otherwise classify with the Manager
    await add_message(project, "agent", "status", "Analyzing your request...", agent="manager")
    await set_workflow(project["id"], status="planning", current_agent="manager")
    decision = await manager_classify(project, content, wf.get("requirements", ""), has_build)
    intent = decision.get("intent", "NEW")
    req_summary = decision.get("requirements_summary", content)

    if intent == "CHAT":
        reply = decision.get("reply") or "How can I help you build today?"
        await set_workflow(project["id"], status=status, current_agent=None)
        await add_message(project, "assistant", "text", reply, agent="manager")
        return {"status": status}

    combined_req = ((wf.get("requirements", "") + "\n" + req_summary).strip()) if wf.get("requirements") else req_summary
    await set_workflow(project["id"], requirements=combined_req)

    if decision.get("needs_clarification"):
        qa = await question_agent(combined_req, is_modify=(intent == "MODIFY"))
        questions = (qa.get("questions") or [])[:4]
        if qa.get("needs_clarification") and questions:
            await set_workflow(project["id"], status="asking")
            await add_message(project, "agent", "questions",
                              "I need a bit more information before I start.",
                              agent="question", data={"questions": questions})
            return {"status": "asking"}

    return await _do_plan(project, combined_req, has_build, intent == "MODIFY")


async def submit_answers(project, answers):
    """Structured answers from the Question card (choice/text/secret)."""
    wf = project.get("workflow", {})
    secrets = {}
    lines = []
    for a in answers:
        val = (a.get("value") or "").strip()
        if not val:
            continue
        if a.get("type") == "secret":
            env_name = re.sub(r"[^A-Z0-9_]", "", (a.get("key") or "API_KEY").upper().replace(" ", "_")) or "API_KEY"
            secrets[env_name] = val
            lines.append(f"- {a.get('question')}: provided securely as env {env_name}")
        else:
            lines.append(f"- {a.get('question')}: {val}")
    if secrets:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Project).filter(Project.id == project["id"]))
            proj = result.scalars().first()
            if proj:
                existing_secrets = dict(proj.secrets) if proj.secrets else {}
                existing_secrets.update(secrets)
                proj.secrets = existing_secrets
                await session.commit()
    answer_text = "Answers:\n" + "\n".join(lines) if lines else "Answers provided."
    await add_message(project, "user", "text", answer_text)
    combined = (wf.get("requirements", "") + "\n\n" + answer_text).strip()
    await set_workflow(project["id"], requirements=combined, status="planning")
    proj = await get_project(project["id"])
    has_build = bool(proj.get("preview_url"))
    return await _do_plan(proj, combined, has_build, has_build)


async def _do_plan(project, requirements, has_build, is_modify=False):
    await add_message(project, "agent", "status", "Planning the implementation...", agent="planner")
    files_summary = ""
    if has_build:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ProjectFile).filter(ProjectFile.project_id == project["id"])
            )
            files = result.scalars().all()
        files_summary = "\n".join(f.path for f in files)
    plan = await planner_run(requirements, files_summary)
    todo = [{"id": t["id"], "title": t["title"], "description": t.get("description", ""), "done": False}
            for t in plan.get("tasks", [])]

    # For small modifications to an already-built project, skip explicit approval.
    if is_modify and has_build:
        await set_workflow(project["id"], plan=plan, todo=todo, status="building",
                           approval_status="auto", requirements=requirements, build_mode="modify")
        await add_message(project, "agent", "plan", f"Plan ready: {plan.get('goal','')}",
                          agent="planner", data={"plan": plan, "todo": todo, "auto": True})
        proj = await get_project(project["id"])
        _launch_build(proj)
        return {"status": "building"}

    await set_workflow(project["id"], plan=plan, todo=todo, status="awaiting_approval",
                       approval_status="pending", requirements=requirements, build_mode="new")
    await add_message(project, "agent", "plan",
                      f"Implementation Plan: {plan.get('goal','')}",
                      agent="planner", data={"plan": plan, "todo": todo})
    return {"status": "awaiting_approval"}


async def request_changes(project, content):
    await add_message(project, "user", "text", content)
    wf = project.get("workflow", {})
    combined = (wf.get("requirements", "") + "\n\nRequested changes: " + content).strip()
    has_build = bool(project.get("preview_url"))
    await set_workflow(project["id"], requirements=combined, status="planning")
    return await _do_plan(project, combined, has_build, has_build)


async def approve_and_build(project):
    await set_workflow(project["id"], status="building", approval_status="approved",
                       stop_requested=False, retry_count=0)
    proj = await get_project(project["id"])
    _launch_build(proj)
    return {"status": "building"}


# --------------------------------------------------------------------------
# Build / Test LangGraph
# --------------------------------------------------------------------------
class BState(TypedDict, total=False):
    project_id: str
    owner_id: str
    client_id: str
    session_id: str
    plan: dict
    entrypoint: str
    files: List[dict]
    logs: str
    tunnel_url: str
    test: dict
    retry: int
    stopped: bool
    exec_ok: bool


CODING_SYS = """You are the Coding Agent of Grizon AI, an expert full-stack engineer.
Generate a COMPLETE, minimal, runnable application from the plan. Prefer few files that actually work.

SANDBOX EXECUTION MODEL (critical): the sandbox runs an ENTRYPOINT which MUST be an ACTUAL FILE you
created in the workspace (NOT a shell command). Never use a start.sh. The sandbox installs deps and
runs the app from the entrypoint file automatically. Choose the framework and set entrypoint exactly:

1. FULL-STACK (default) - React + Vite + TypeScript frontend in frontend/, Express + TypeScript backend in backend/.
   - frontend/ files: package.json, vite.config.ts, index.html, tsconfig.json, tsconfig.node.json,
     tailwind.config.ts, postcss.config.mjs, src/main.tsx, src/App.tsx, src/index.css.
   - backend/ files: package.json, tsconfig.json, server.ts.
   - Backend binds 0.0.0.0:3001. Vite binds host '0.0.0.0' port 9999 and proxies /api -> http://localhost:3001.
   - entrypoint MUST be "frontend/src/main.tsx" (this triggers the dual-service runner that starts BOTH
     the Vite frontend on 9999 and the Express backend on 3001).
   - framework = "vite-express".

2. SINGLE-SERVICE - a single server (FastAPI/Flask/Express-only/Node-only).
   - The server MUST bind 0.0.0.0 and listen on port 9999. NO debug/reload modes.
   - Python: include requirements.txt; entrypoint = the server file, e.g. "server.py" or "app.py".
   - Node/Express TS: entrypoint = "server.ts".
   - framework = "single".

3. NEXT.JS (only if the user explicitly asks for Next.js) - put ALL files in the workspace ROOT (not frontend/).
   TypeScript. Files: package.json, next.config.ts, tsconfig.json, tailwind.config.ts, postcss.config.mjs,
   src/app/layout.tsx, src/app/page.tsx, src/app/globals.css. Backend via Next.js API routes.
   package.json scripts.dev MUST be "next dev -H 0.0.0.0 -p 9999".
   - entrypoint MUST be "package.json".
   - framework = "nextjs".

Use JavaScript ONLY if the user explicitly requests it; otherwise TypeScript.

Keep the app MINIMAL: prefer the fewest files that still run (target ~8-10 files for a full-stack app,
fewer for single-service). Keep each file concise and complete.

OUTPUT FORMAT (this is NOT JSON). Emit exactly three header lines, then one block per file:

FRAMEWORK: <vite-express|nextjs|single>
ENTRYPOINT: <entrypoint file path>
SUMMARY: <one line>

===GRIZON_FILE: relative/path/to/file===
<full raw file content here>
===GRIZON_END===

Repeat the ===GRIZON_FILE...===GRIZON_END=== block for every file. Do NOT wrap content in quotes or
escape it. Do NOT output any other prose, explanation, or markdown fences. Every package.json must list
all needed dependencies so install succeeds."""


def parse_code_output(raw: str) -> dict:
    import re
    fw = re.search(r"FRAMEWORK:\s*([^\s]+)", raw)
    ep = re.search(r"ENTRYPOINT:\s*([^\s]+)", raw)
    sm = re.search(r"SUMMARY:\s*(.+)", raw)
    files = []
    for m in re.finditer(r"===GRIZON_FILE:\s*(.+?)\s*===\s*\n(.*?)\n===GRIZON_END===", raw, re.DOTALL):
        files.append({"path": m.group(1).strip(), "content": m.group(2)})
    return {
        "framework": fw.group(1) if fw else "vite-express",
        "entrypoint": ep.group(1) if ep else "frontend/src/main.tsx",
        "summary": sm.group(1).strip() if sm else "",
        "files": files,
    }


async def coding_node(state: BState) -> BState:
    project = await get_project(state["project_id"])
    if project.get("workflow", {}).get("stop_requested"):
        state["stopped"] = True
        return state
    retry = state.get("retry", 0)
    wf = project.get("workflow", {})
    is_modify = wf.get("build_mode") == "modify"
    await add_message(project, "agent", "status",
                      "Fixing issues and regenerating code..." if retry
                      else ("Applying your changes..." if is_modify else "Writing application code..."),
                      agent="coding")

    skills = await get_skills_for("coding")
    prompt = f"PLAN:\n{state['plan']}\n"

    # Inject securely-stored secrets so the coding agent wires them into the backend env only.
    secrets = project.get("secrets") or {}
    if secrets:
        pairs = "\n".join(f"{k}={v}" for k, v in secrets.items())
        prompt += ("\nSECRETS (write these into a backend .env file and read via process.env / os.environ. "
                   "NEVER hardcode them in frontend/client code):\n" + pairs + "\n")

    if is_modify and not retry:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ProjectFile).filter(ProjectFile.project_id == state["project_id"])
            )
            existing = result.scalars().all()
        prompt += ("\nThis is a MODIFICATION of an EXISTING app. Apply ONLY the requested change and keep "
                   "everything else byte-for-byte identical. Do not restructure or rebuild unrelated parts.\n")
        prompt += f"Requested change / current requirements:\n{wf.get('requirements','')}\n\nExisting files:\n"
        for f in existing:
            prompt += f"\n===GRIZON_FILE: {f.path}===\n{(f.content or '')[:3500]}\n===GRIZON_END===\n"
        prompt += "\nReturn ONLY the files you changed (same output format). Reuse the same FRAMEWORK and ENTRYPOINT."
    elif retry and state.get("test"):
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ProjectFile).filter(ProjectFile.project_id == state["project_id"])
            )
            existing = result.scalars().all()
        prompt += f"\nThe previous build FAILED. Test results:\n{state.get('test')}\n"
        prompt += f"\nSandbox logs:\n{state.get('logs','')[:4000]}\n"
        prompt += "\nExisting files:\n" + "\n".join(f.path for f in existing)
        prompt += "\nReturn ONLY the files you need to change/add (same output format), fixing minimally."
    if skills:
        prompt += f"\n\nRELEVANT SKILLS:\n{skills[:6000]}"

    model, provider = await config.get_agent_model("coding")
    raw = await llm.chat(CODING_SYS, prompt, temperature=0.2, max_tokens=28000, model=model, provider=provider)
    data = parse_code_output(raw)

    async with AsyncSessionLocal() as session:
        execution = AgentExecution(
            id=str(uuid.uuid4()),
            project_id=state["project_id"],
            owner_id=state["owner_id"],
            agent="coding",
            status="done",
            created_at=datetime.utcnow(),
        )
        session.add(execution)
        await session.commit()

    if not data.get("files"):
        await add_message(project, "agent", "status",
                          "Coding agent could not produce valid output.", agent="coding")
        state["files"] = []
        state["exec_ok"] = False
        return state

    files = data.get("files", [])
    if data.get("entrypoint"):
        state["entrypoint"] = data.get("entrypoint")
    elif not state.get("entrypoint"):
        state["entrypoint"] = "frontend/src/main.tsx"
    state["files"] = files

    # For a fresh (new) build, clear any stale files from earlier generations.
    if not is_modify and not retry:
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(ProjectFile).filter(ProjectFile.project_id == state["project_id"])
            )
            await session.commit()

    for f in files:
        path, code = f.get("path"), f.get("content", "")
        if not path:
            continue
        # stream which file is being written (clickable in the UI)
        await add_message(project, "agent", "file", path, agent="coding", data={"path": path})
        try:
            await mcp.save_code(state["session_id"], path, code, state["client_id"])
        except Exception as e:
            await add_message(project, "agent", "log", f"save_code failed for {path}: {e}", agent="coding")

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ProjectFile).filter(
                    ProjectFile.project_id == state["project_id"],
                    ProjectFile.path == path
                )
            )
            existing_file = result.scalars().first()
            if existing_file:
                existing_file.content = code
                existing_file.updated_at = datetime.utcnow()
            else:
                pf = ProjectFile(
                    id=str(uuid.uuid4()),
                    project_id=state["project_id"],
                    path=path,
                    content=code,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                session.add(pf)
            await session.commit()

    await add_message(project, "agent", "text",
                      f"{'Updated' if is_modify else 'Generated'} {len(files)} file(s). {data.get('summary','')}",
                      agent="coding",
                      data={"files": [f.get("path") for f in files], "framework": data.get("framework")})
    return state


async def execute_node(state: BState) -> BState:
    project = await get_project(state["project_id"])
    if project.get("workflow", {}).get("stop_requested"):
        state["stopped"] = True
        return state
    if not state.get("files"):
        state["exec_ok"] = False
        return state
    await set_workflow(state["project_id"], status="building")
    await add_message(project, "agent", "status",
                      "Deploying to NemoClaw sandbox and running...", agent="coding")
    try:
        res = await mcp.execute_in_sandbox(state["session_id"], state.get("entrypoint", "frontend/src/main.tsx"),
                                           state["client_id"])
    except Exception as e:
        await add_message(project, "agent", "log", f"Sandbox execution error: {e}", agent="coding")
        state["exec_ok"] = False
        state["logs"] = str(e)
        return state

    output = res.get("execution_output", "") if isinstance(res, dict) else str(res)
    tunnel = res.get("tunnel_url") if isinstance(res, dict) else None
    state["logs"] = output
    state["exec_ok"] = bool(tunnel) or (isinstance(res, dict) and res.get("status") == "success")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SandboxSession).filter(SandboxSession.session_id == state["session_id"])
        )
        sandbox = result.scalars().first()
        if sandbox:
            sandbox.project_id = state["project_id"]
            sandbox.owner_id = state["owner_id"]
            sandbox.sandbox_name = res.get("sandbox_name") if isinstance(res, dict) else None
            sandbox.tunnel_url = tunnel
            sandbox.active = True
            sandbox.updated_at = datetime.utcnow()
        else:
            sandbox = SandboxSession(
                id=str(uuid.uuid4()),
                session_id=state["session_id"],
                project_id=state["project_id"],
                owner_id=state["owner_id"],
                sandbox_name=res.get("sandbox_name") if isinstance(res, dict) else None,
                tunnel_url=tunnel,
                active=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            session.add(sandbox)
        await session.commit()

    if tunnel:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Project).filter(Project.id == state["project_id"]))
            proj = result.scalars().first()
            if proj:
                proj.preview_url = tunnel
                proj.updated_at = datetime.utcnow()
                await session.commit()
        state["tunnel_url"] = tunnel
        await add_message(project, "agent", "status", f"Live preview is up: {tunnel}",
                          agent="coding", data={"tunnel_url": tunnel})
    await add_message(project, "agent", "log", output[:6000] or "(no output)", agent="coding")
    return state


TESTING_SYS = """You are the Testing Agent of Grizon AI. Given the plan, sandbox logs and whether a
public preview URL came up, verify whether the app's core functionality works.
Return ONLY JSON:
{
  "status": "PASS" | "FAIL",
  "tests": [{"name": "string", "status": "PASS" | "FAIL", "error": "string (optional)"}],
  "prd": "A concise PRD (markdown) describing what was implemented, features, and how to use it."
}
Judge FAIL if the preview never came up or logs show fatal errors. Otherwise judge PASS."""


async def testing_node(state: BState) -> BState:
    project = await get_project(state["project_id"])
    if project.get("workflow", {}).get("stop_requested"):
        state["stopped"] = True
        return state
    await set_workflow(state["project_id"], status="testing")
    await add_message(project, "agent", "status", "Testing the application...", agent="testing")

    prompt = (f"PLAN:\n{state['plan']}\n\nPreview URL present: {bool(state.get('tunnel_url'))}\n"
              f"Execution ok: {state.get('exec_ok')}\n\nSandbox logs:\n{state.get('logs','')[:5000]}")
    model, provider = await config.get_agent_model("testing")
    data, raw = await llm.chat_json(TESTING_SYS, prompt, temperature=0.1, model=model, provider=provider)
    if not data:
        data = {"status": "PASS" if state.get("tunnel_url") else "FAIL",
                "tests": [{"name": "Preview available",
                           "status": "PASS" if state.get("tunnel_url") else "FAIL"}],
                "prd": "Application built."}
    # Guard: no tunnel => fail
    if not state.get("tunnel_url"):
        data["status"] = "FAIL"
    state["test"] = data
    await set_workflow(state["project_id"], test_status=data.get("status"))

    await add_message(project, "agent", "status", f"Testing result: {data.get('status')}",
                      agent="testing", data={"tests": data.get("tests", [])})
    return state


def route_after_coding(state: BState):
    return END if state.get("stopped") else "execute"


def route_after_execute(state: BState):
    return END if state.get("stopped") else "testing"


def route_after_testing(state: BState):
    if state.get("stopped"):
        return END
    test = state.get("test", {})
    if test.get("status") == "PASS":
        return "complete"
    if state.get("retry", 0) < MAX_RETRIES:
        return "fix"
    return "complete"


async def fix_node(state: BState) -> BState:
    state["retry"] = state.get("retry", 0) + 1
    project = await get_project(state["project_id"])
    await set_workflow(state["project_id"], retry_count=state["retry"], status="building")
    await add_message(project, "agent", "status",
                      f"Tests failed. Manager is routing back to the Coding Agent (attempt {state['retry']}).",
                      agent="manager")
    return state


async def complete_node(state: BState) -> BState:
    project = await get_project(state["project_id"])
    test = state.get("test", {})
    if state.get("stopped"):
        await set_workflow(state["project_id"], status="paused")
        return state
    passed = test.get("status") == "PASS"
    await set_workflow(state["project_id"], status="complete" if passed else "failed")
    if test.get("prd"):
        await add_message(project, "assistant", "prd", test["prd"], agent="manager",
                          data={"status": test.get("status")})
    await add_message(project, "assistant", "text",
                      "Build complete. Your live preview is ready on the right." if passed
                      else "I couldn't get the app fully working after retries. You can Retry or send new instructions.",
                      agent="manager")
    await log_event(state["owner_id"], state["project_id"], "build_finished",
                    {"status": test.get("status")})
    return state


def _build_graph():
    g = StateGraph(BState)
    g.add_node("coding", coding_node)
    g.add_node("execute", execute_node)
    g.add_node("testing", testing_node)
    g.add_node("fix", fix_node)
    g.add_node("complete", complete_node)
    g.set_entry_point("coding")
    g.add_conditional_edges("coding", route_after_coding, {"execute": "execute", END: END})
    g.add_conditional_edges("execute", route_after_execute, {"testing": "testing", END: END})
    g.add_conditional_edges("testing", route_after_testing,
                            {"fix": "fix", "complete": "complete", END: END})
    g.add_edge("fix", "coding")
    g.add_edge("complete", END)
    return g.compile()


BUILD_GRAPH = _build_graph()


async def _run_build(project):
    pid = project["id"]

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).filter(User.id == project["owner_id"]))
        owner = result.scalars().first()
    client_id = (owner.mcp_client_id if owner else None) or "grizon"

    run_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as session:
        run = WorkflowRun(
            id=run_id,
            project_id=pid,
            owner_id=project["owner_id"],
            status="running",
            created_at=datetime.utcnow(),
        )
        session.add(run)
        await session.commit()

    state: BState = {
        "project_id": pid, "owner_id": project["owner_id"], "client_id": client_id,
        "session_id": project.get("session_id", ""), "plan": project.get("workflow", {}).get("plan", {}),
        "retry": project.get("workflow", {}).get("retry_count", 0),
    }
    try:
        await BUILD_GRAPH.ainvoke(state, config={"recursion_limit": 30})
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(WorkflowRun).filter(WorkflowRun.id == run_id))
            run = result.scalars().first()
            if run:
                run.status = "done"
                await session.commit()
    except Exception as e:
        await set_workflow(pid, status="failed")
        await add_message(project, "system", "status", f"Build crashed: {e}")
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(WorkflowRun).filter(WorkflowRun.id == run_id))
            run = result.scalars().first()
            if run:
                run.status = "error"
                run.error = str(e)
                await session.commit()
    finally:
        _running_tasks.pop(pid, None)


def _launch_build(project):
    task = asyncio.create_task(_run_build(project))
    _running_tasks[project["id"]] = task


async def stop_build(project):
    await set_workflow(project["id"], stop_requested=True, status="paused")
    await add_message(project, "system", "status", "Workflow paused. Send an instruction to continue.")


async def retry_build(project):
    await set_workflow(project["id"], stop_requested=False, status="building", retry_count=0)
    proj = await get_project(project["id"])
    _launch_build(proj)
