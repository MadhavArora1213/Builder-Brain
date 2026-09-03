"""Runtime configuration (models + integration credentials) editable by admins.
Values are stored in system_config and fall back to environment variables.
"""
import os
from sqlalchemy import select
from db import AsyncSessionLocal
from models import SystemConfig

AGENTS = ["manager", "question", "planner", "coding", "testing"]


async def get_integrations() -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SystemConfig).filter(SystemConfig.id == "config"))
        doc = result.scalars().first()
        integ = doc.integrations if doc else {}
    
    return {
        "sarvam_api_key": integ.get("sarvam_api_key") or os.environ.get("SARVAM_API_KEY", ""),
        "sarvam_base_url": integ.get("sarvam_base_url") or os.environ.get("SARVAM_BASE_URL", ""),
        "sarvam_model": integ.get("sarvam_model") or os.environ.get("SARVAM_MODEL", "glm5.2"),
        "openrouter_api_key": integ.get("openrouter_api_key") or os.environ.get("OPENROUTER_API_KEY", ""),
        "openrouter_base_url": integ.get("openrouter_base_url") or os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        "openrouter_model": integ.get("openrouter_model") or os.environ.get("OPENROUTER_MODEL", "google/gemini-3.7-flash"),
        "mcp_url": integ.get("mcp_url") or os.environ.get("SANDBOX_MCP_URL", ""),
        "mcp_token": integ.get("mcp_token") or os.environ.get("SANDBOX_MCP_TOKEN", ""),
        "unsplash_access_key": integ.get("unsplash_access_key") or os.environ.get("UNSPLASH_ACCESS_KEY", ""),
    }


async def update_integrations(fields: dict):
    clean = {k: v for k, v in fields.items()
             if k in ("sarvam_api_key", "sarvam_base_url", "sarvam_model", 
                     "openrouter_api_key", "openrouter_base_url", "openrouter_model",
                     "mcp_url", "mcp_token", "unsplash_access_key") and v is not None}
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SystemConfig).filter(SystemConfig.id == "config"))
        config = result.scalars().first()
        if config:
            config.integrations.update(clean)
        else:
            config = SystemConfig(id="config", integrations=clean)
            session.add(config)
        await session.commit()


async def get_agent_models() -> dict:
    """Returns {agent: {model: "...", provider: "sarvam|openrouter"}}"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SystemConfig).filter(SystemConfig.id == "config"))
        doc = result.scalars().first()
        models = doc.agent_models if doc else {}
    
    integ = await get_integrations()
    default_model = integ["sarvam_model"]
    default_provider = "sarvam"
    
    result = {}
    for a in AGENTS:
        agent_config = models.get(a, {})
        if isinstance(agent_config, str):  # backward compatibility: old format was just model string
            result[a] = {"model": agent_config, "provider": "sarvam"}
        else:
            result[a] = {
                "model": agent_config.get("model") or default_model,
                "provider": agent_config.get("provider") or default_provider
            }
    return result


async def get_agent_model(agent: str) -> tuple[str, str]:
    """Returns (model, provider) for an agent"""
    models = await get_agent_models()
    config = models.get(agent, {})
    return config.get("model", "glm5.2"), config.get("provider", "sarvam")


async def set_agent_models(models: dict):
    """models: {agent: {model: "...", provider: "sarvam|openrouter"}}"""
    clean = {}
    for a in AGENTS:
        if a in models and models[a]:
            clean[a] = {
                "model": models[a].get("model") or "glm5.2",
                "provider": models[a].get("provider") or "sarvam"
            }

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SystemConfig).filter(SystemConfig.id == "config"))
        config = result.scalars().first()
        if config:
            config.agent_models = clean
        else:
            config = SystemConfig(id="config", agent_models=clean)
            session.add(config)
        await session.commit()


# ---------------------------------------------------------------------------
# Agent system prompts (dynamic, stored in settings JSON, cached in memory)
# ---------------------------------------------------------------------------
_prompts_cache: dict | None = None

DEFAULT_AGENT_PROMPTS = {
    "manager": """You are the Manager Agent of Grizon AI, an autonomous full-stack app builder.
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
  (e.g. "change the color" with no color given).""",

    "question": """You are the Question Agent of Grizon AI. Produce ONLY the essential clarifying
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
type is one of "choice" | "text" | "secret". If nothing needs asking, return needs_clarification false and an empty questions array.""",

    "planner": """You are the Planner Agent of Grizon AI. Convert confirmed requirements into a
structured implementation plan. Inspect the existing project when modifying; do NOT redesign it.
Return ONLY JSON:
{
  "goal": "string",
  "architecture": {"frontend": "string", "backend": "string"},
  "technology": ["string"],
  "components": ["string"],
  "database": {"required": true, "tables": ["string"]},
  "tasks": [{"id": "task-1", "title": "string", "description": "string"}],
  "dependencies": ["string"],
  "theme": "dark" | "light",
  "visual_style": "luxury" | "modern" | "minimal" | "playful" | "professional"
}
Default stack: React + Vite + TypeScript frontend, Express + TypeScript backend, unless the user
explicitly asks for Next.js or something else. Keep tasks concrete and ordered (5-9 tasks).
Include a "theme" field (dark/light) based on the project description.
Include a "visual_style" field to guide image selection (luxury for jewelry, modern for tech, etc.).""",

    "coding": """You are the Coding Agent of Grizon AI, an expert full-stack engineer.
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
all needed dependencies so install succeeds.

IMAGE HANDLING (critical for visual quality):
If a "FETCHED IMAGES" section appears in the plan, you MUST use those Unsplash image URLs in your code.

Rules for images:
1. HERO SECTION: Always use the first hero image as the main hero/banner background with:
   <img src="URL" className="w-full h-[500px] object-cover" alt="DESCRIPTION" />
   OR as CSS background: style={{ backgroundImage: `url('URL')` }}

2. PRODUCT/CARD IMAGES: Use product images in card grids, product listings, features sections.
   Each image must have proper alt text and responsive sizing.

3. THEME MATCHING:
   - Dark theme: Use dark, moody, dramatic images. Apply dark overlays with Tailwind:
     <div className="absolute inset-0 bg-black/40"></div> over the image
   - Light theme: Use bright, clean, airy images. Keep them prominent and visible.

4. CREDIT: Add a small credit line in the footer or bottom corner:
   <p className="text-xs text-gray-400">Photo by {photographer} on Unsplash</p>

5. RESPONSIVE IMAGES: Always use Tailwind classes for responsive sizing:
   - Hero: w-full h-[400px] md:h-[500px] lg:h-[600px] object-cover
   - Cards: w-full h-48 md:h-56 object-cover rounded-lg
   - Thumbnails: w-16 h-16 object-cover rounded-full

6. FALLBACK: If no FETCHED IMAGES section exists, use placeholder gradient backgrounds
   or abstract patterns instead of broken image links.

7. NEVER use external image URLs other than the provided Unsplash URLs or placeholder sources.""",

    "testing": """You are the Testing Agent of Grizon AI. Given the plan, sandbox logs and whether a
public preview URL came up, verify whether the app's core functionality works.
Return ONLY JSON:
{
  "status": "PASS" | "FAIL",
  "tests": [{"name": "string", "status": "PASS" | "FAIL", "error": "string (optional)"}],
  "prd": "A concise PRD (markdown) describing what was implemented, features, and how to use it."
}
Judge FAIL if the preview never came up or logs show fatal errors. Otherwise judge PASS.""",
}


async def get_agent_prompts() -> dict:
    """Returns {agent: prompt_string} for all agents, with in-memory cache."""
    global _prompts_cache
    if _prompts_cache is not None:
        return dict(_prompts_cache)
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SystemConfig).filter(SystemConfig.id == "config"))
        doc = result.scalars().first()
        settings = doc.settings if doc else {}
    db_prompts = settings.get("agent_prompts", {}) if isinstance(settings, dict) else {}
    out = {}
    for a in AGENTS:
        out[a] = db_prompts.get(a) or DEFAULT_AGENT_PROMPTS.get(a, "")
    _prompts_cache = out
    return dict(out)


async def get_agent_prompt(agent: str) -> str:
    """Returns the system prompt for a single agent (cached)."""
    prompts = await get_agent_prompts()
    return prompts.get(agent, DEFAULT_AGENT_PROMPTS.get(agent, ""))


async def set_agent_prompts(prompts: dict):
    """prompts: {agent: prompt_string} — merges into settings.agent_prompts, invalidates cache."""
    global _prompts_cache
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SystemConfig).filter(SystemConfig.id == "config"))
        doc = result.scalars().first()
        if doc:
            settings = dict(doc.settings) if doc.settings else {}
        else:
            settings = {}
        agent_prompts = dict(settings.get("agent_prompts", {}))
        for a in AGENTS:
            if a in prompts and prompts[a] is not None:
                agent_prompts[a] = prompts[a]
        settings["agent_prompts"] = agent_prompts
        if doc:
            doc.settings = settings
        else:
            doc = SystemConfig(id="config", settings=settings)
            session.add(doc)
        await session.commit()
    _prompts_cache = None  # invalidate cache


async def reset_agent_prompts():
    """Reset all agent prompts back to hardcoded defaults."""
    await set_agent_prompts(DEFAULT_AGENT_PROMPTS.copy())
