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
import github_router
import unsplash
import logging
from db import AsyncSessionLocal, log_event
from models import Project, Message, ProjectFile, Skill, User, WorkflowRun, SandboxSession, AgentExecution

MAX_RETRIES = 2
_running_tasks: dict = {}
logger = logging.getLogger("grizon.orchestrator")


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
# Dynamic system prompts (loaded from DB via config module)
# --------------------------------------------------------------------------
async def _get_prompt(agent: str) -> str:
    """Load agent system prompt from DB; falls back to hardcoded defaults."""
    return await config.get_agent_prompt(agent)


# --------------------------------------------------------------------------
# Manager Agent
# --------------------------------------------------------------------------


async def manager_classify(project, user_message, existing_summary, has_build):
    ctx = f"Existing project: {'yes, already built' if has_build else 'no'}.\n"
    if existing_summary:
        ctx += f"Prior requirements: {existing_summary}\n"
    ctx += f"User message: {user_message}"
    model, provider = await config.get_agent_model("manager")
    data, raw = await llm.chat_json(await _get_prompt("manager"), ctx, model=model, provider=provider)
    if not data:
        data = {"intent": "NEW", "needs_clarification": False,
                "reply": "", "requirements_summary": user_message}
    return data


# --------------------------------------------------------------------------
# Question Agent
# --------------------------------------------------------------------------


async def question_agent(requirements, is_modify=False):
    prompt = f"{'MODIFICATION' if is_modify else 'NEW APP'} requirements:\n{requirements}"
    model, provider = await config.get_agent_model("question")
    data, raw = await llm.chat_json(await _get_prompt("question"), prompt, model=model, provider=provider)
    if not data:
        return {"needs_clarification": False, "questions": []}
    return data


# --------------------------------------------------------------------------
# Planner Agent
# --------------------------------------------------------------------------


async def planner_run(requirements, existing_files_summary=""):
    prompt = f"Requirements:\n{requirements}\n"
    if existing_files_summary:
        prompt += f"\nExisting project files:\n{existing_files_summary}\nModify minimally."
    model, provider = await config.get_agent_model("planner")
    data, raw = await llm.chat_json(await _get_prompt("planner"), prompt, model=model, provider=provider)
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


def parse_code_output(raw: str) -> dict:
    import re
    fw = re.search(r"FRAMEWORK:\s*([^\s]+)", raw)
    ep = re.search(r"ENTRYPOINT:\s*([^\s]+)", raw)
    sm = re.search(r"SUMMARY:\s*(.+)", raw)
    files = []
    for m in re.finditer(r"===GRIZON_FILE:\s*(.+?)\s*===\s*\n(.*?)\s*\n?\s*===GRIZON_END===", raw, re.DOTALL):
        raw_path = m.group(1).strip()
        content = m.group(2)
        # If path contains newlines, the LLM put content in the path field.
        # Take only the first line as path, rest as content.
        if "\n" in raw_path:
            lines = raw_path.split("\n", 1)
            raw_path = lines[0].strip()
            content = lines[1] + content
        # Truncate very long paths (likely garbage)
        if len(raw_path) > 200:
            raw_path = raw_path[:200]
        files.append({"path": raw_path, "content": content})
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

    # Fetch relevant images from Unsplash based on project requirements
    requirements = wf.get('requirements', '') or state.get('plan', {}).get('goal', '')
    if requirements and not is_modify and not retry:
        await add_message(project, "agent", "status", "Fetching relevant images for your project...", agent="coding")
        try:
            # Get theme and visual style from plan
            plan = state.get('plan', {})
            theme = plan.get('theme', 'light')
            visual_style = plan.get('visual_style', 'modern')
            
            # Build search query based on visual style and requirements
            search_query = requirements
            if visual_style == "luxury":
                search_query = f"{requirements} luxury elegant premium"
            elif visual_style == "minimal":
                search_query = f"{requirements} minimal clean simple"
            elif visual_style == "playful":
                search_query = f"{requirements} colorful fun vibrant"
            elif visual_style == "professional":
                search_query = f"{requirements} professional corporate modern"
            
            images = await unsplash.get_curated_images(search_query, theme=theme, visual_style=visual_style, count=8)
            images_text = unsplash.format_images_for_prompt(images)
            if images_text:
                prompt += images_text
                await add_message(project, "agent", "status", f"Fetched {sum(len(v) for v in images.values())} relevant images ({theme} theme, {visual_style} style)", agent="coding")
        except Exception as e:
            logger.warning(f"Failed to fetch Unsplash images: {e}")

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
    
    # --- STREAMING CODE GENERATION ---
    await add_message(project, "agent", "status", "Generating code...", agent="coding")
    
    # For a fresh (new) build, clear any stale files from earlier generations BEFORE streaming.
    if not is_modify and not retry:
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(ProjectFile).filter(ProjectFile.project_id == state["project_id"])
            )
            await session.commit()
    
    full_output = ""
    files = []
    written_paths = set()
    framework = "vite-express"
    entrypoint = "frontend/src/main.tsx"
    summary = ""
    
    # Stream chunks and accumulate full output
    async for chunk in llm.chat_stream(await _get_prompt("coding"), prompt, temperature=0.2, max_tokens=28000, model=model, provider=provider):
        full_output += chunk
        
        # Parse header lines as they appear
        if not summary and "SUMMARY:" in full_output:
            sm_match = re.search(r"SUMMARY:\s*(.+?)(?:\n|$)", full_output)
            if sm_match:
                summary = sm_match.group(1).strip()
        
        # Detect completed files in real-time
        completed = re.findall(r"===GRIZON_FILE:\s*(.+?)===\s*\n(.*?)\s*\n?\s*===GRIZON_END===", full_output, re.DOTALL)
        for path, content in completed:
            path = path.strip().lstrip("./").replace("\\", "/")
            if "\n" in path:
                path = path.split("\n", 1)[0].strip()
            if path and path not in written_paths:
                written_paths.add(path)
                files.append({"path": path, "content": content})
                await add_message(project, "agent", "status", f"Writing {path}...", agent="coding")
                await add_message(project, "agent", "file", path, agent="coding", data={"path": path})
                # Save to sandbox immediately
                try:
                    await mcp.save_code(state["session_id"], path, content, state["client_id"])
                except Exception as e:
                    await add_message(project, "agent", "log", f"save_code failed for {path}: {e}", agent="coding")
                # Save to DB
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        select(ProjectFile).filter(
                            ProjectFile.project_id == state["project_id"],
                            ProjectFile.path == path
                        )
                    )
                    existing_file = result.scalars().first()
                    if existing_file:
                        existing_file.content = content
                        existing_file.updated_at = datetime.utcnow()
                    else:
                        pf = ProjectFile(
                            id=str(uuid.uuid4()),
                            project_id=state["project_id"],
                            path=path,
                            content=content,
                            created_at=datetime.utcnow(),
                            updated_at=datetime.utcnow(),
                        )
                        session.add(pf)
                    await session.commit()
    
    # Parse final output for framework/entrypoint
    fw_match = re.search(r"FRAMEWORK:\s*(\S+)", full_output)
    if fw_match:
        framework = fw_match.group(1)
    ep_match = re.search(r"ENTRYPOINT:\s*(\S+)", full_output)
    if ep_match:
        entrypoint = ep_match.group(1)
    
    # --- END STREAMING ---
    
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

    if not files:
        await add_message(project, "agent", "status",
                          "Coding agent could not produce valid output.", agent="coding")
        state["files"] = []
        state["exec_ok"] = False
        return state

    state["entrypoint"] = entrypoint
    state["files"] = files

    await add_message(project, "agent", "text",
                      f"{'Updated' if is_modify else 'Generated'} {len(files)} file(s). {summary}",
                      agent="coding",
                      data={"files": [f.get("path") for f in files], "framework": framework})
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
    data, raw = await llm.chat_json(await _get_prompt("testing"), prompt, temperature=0.1, model=model, provider=provider)
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
    if passed:
        try:
            github_result = await github_router.publish_project(state["project_id"], state["owner_id"])
            await set_workflow(state["project_id"], github=github_result)
        except Exception as exc:
            logger.error("GitHub publish failed for project %s: %s", state["project_id"], exc)
            await set_workflow(state["project_id"], github={"status": "failed", "error": str(exc)})
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
