import uuid
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func

from auth import require_admin
from db import AsyncSessionLocal, MANAGED_COLLECTIONS
from models import User, Project, Message, WorkflowRun, Skill, SandboxSession, SystemConfig
import config
import mcp_client as mcp

router = APIRouter(prefix="/api/admin", tags=["admin"])


def now_iso():
    return datetime.utcnow().isoformat()


@router.get("/stats")
async def stats(admin: dict = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        users = (await session.execute(select(func.count(User.id)))).scalar() or 0
        projects = (await session.execute(select(func.count(Project.id)))).scalar() or 0
        messages = (await session.execute(select(func.count(Message.id)))).scalar() or 0
        builds = (await session.execute(select(func.count(WorkflowRun.id)))).scalar() or 0
    return {"users": users, "projects": projects, "messages": messages, "builds": builds}


@router.get("/tables")
async def tables(admin: dict = Depends(require_admin)):
    MODEL_MAP = {
        "users": User, "projects": Project, "messages": Message,
        "workflow_runs": WorkflowRun, "skills": Skill,
        "sandbox_sessions": SandboxSession,
    }
    out = []
    async with AsyncSessionLocal() as session:
        for name in MANAGED_COLLECTIONS:
            model = MODEL_MAP.get(name)
            if model:
                count = (await session.execute(select(func.count(model.id)))).scalar() or 0
            else:
                count = 0
            out.append({"name": name, "count": count})
    return out


@router.get("/tables/{name}")
async def table_rows(name: str, admin: dict = Depends(require_admin)):
    if name not in MANAGED_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown table")
    MODEL_MAP = {
        "users": (User, ["password_hash"]),
        "projects": (Project, []),
        "messages": (Message, []),
        "skills": (Skill, []),
        "workflow_runs": (WorkflowRun, []),
        "sandbox_sessions": (SandboxSession, []),
    }
    entry = MODEL_MAP.get(name)
    if not entry:
        return {"name": name, "rows": []}
    model, hide_cols = entry
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(model).limit(100))
        rows = result.scalars().all()
    out_rows = []
    for row in rows:
        d = {}
        for col in row.__table__.columns:
            if col.name in hide_cols:
                continue
            val = getattr(row, col.name)
            if isinstance(val, datetime):
                val = val.isoformat()
            d[col.name] = val
        out_rows.append(d)
    return {"name": name, "rows": out_rows}


# ---- Skills management ----
class SkillBody(BaseModel):
    name: str
    content: str = ""
    category: str = "coding"
    agents: list = ["coding"]
    enabled: bool = True


@router.get("/skills")
async def list_skills(admin: dict = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Skill).order_by(Skill.name).limit(200))
        skills = result.scalars().all()
    return [_skill_to_dict(s) for s in skills]


def _skill_to_dict(s: Skill) -> dict:
    return {
        "id": s.id, "name": s.name, "content": s.content or "",
        "category": s.category, "agents": s.agents or [], "enabled": s.enabled,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.post("/skills")
async def create_skill(body: SkillBody, admin: dict = Depends(require_admin)):
    skill = Skill(
        id=str(uuid.uuid4()),
        name=body.name,
        content=body.content,
        category=body.category,
        agents=body.agents,
        enabled=body.enabled,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    async with AsyncSessionLocal() as session:
        session.add(skill)
        await session.commit()
    return _skill_to_dict(skill)


@router.put("/skills/{skill_id}")
async def update_skill(skill_id: str, body: SkillBody, admin: dict = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Skill).filter(Skill.id == skill_id))
        skill = result.scalars().first()
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")
        skill.name = body.name
        skill.content = body.content
        skill.category = body.category
        skill.agents = body.agents
        skill.enabled = body.enabled
        skill.updated_at = datetime.utcnow()
        await session.commit()
        return _skill_to_dict(skill)


@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str, admin: dict = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Skill).filter(Skill.id == skill_id))
        skill = result.scalars().first()
        if skill:
            await session.delete(skill)
            await session.commit()
    return {"ok": True}


@router.get("/sandboxes")
async def all_sandboxes(admin: dict = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SandboxSession).limit(200))
        sessions = result.scalars().all()
    return {"sandboxes": [
        {c.name: (getattr(s, c.name).isoformat() if isinstance(getattr(s, c.name), datetime) else getattr(s, c.name))
         for c in s.__table__.columns}
        for s in sessions
    ]}


# ---- Agent model configuration ----
class AgentModelsBody(BaseModel):
    models: dict


@router.get("/agent-models")
async def get_agent_models(admin: dict = Depends(require_admin)):
    return {"models": await config.get_agent_models()}


@router.put("/agent-models")
async def put_agent_models(body: AgentModelsBody, admin: dict = Depends(require_admin)):
    await config.set_agent_models(body.models)
    return {"models": await config.get_agent_models()}


# ---- Integration credentials (Sarvam + OpenRouter + NemoClaw MCP) ----
class IntegrationsBody(BaseModel):
    sarvam_api_key: str | None = None
    sarvam_base_url: str | None = None
    sarvam_model: str | None = None
    openrouter_api_key: str | None = None
    openrouter_base_url: str | None = None
    openrouter_model: str | None = None
    mcp_url: str | None = None
    mcp_token: str | None = None


@router.get("/settings")
async def get_settings(admin: dict = Depends(require_admin)):
    return await config.get_integrations()


@router.put("/settings")
async def put_settings(body: IntegrationsBody, admin: dict = Depends(require_admin)):
    await config.update_integrations(body.dict(exclude_none=True))
    return await config.get_integrations()


# ---- Available models per provider ----
@router.get("/models/{provider}")
async def list_models(provider: str, admin: dict = Depends(require_admin)):
    integ = await config.get_integrations()
    try:
        if provider == "openrouter":
            api_key = integ.get("openrouter_api_key", "")
            base_url = (integ.get("openrouter_base_url") or "https://openrouter.ai/api/v1").rstrip("/")
            models_url = base_url + "/models"
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(models_url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            models = []
            for m in data.get("data", []):
                models.append({
                    "id": m.get("id", ""),
                    "name": m.get("name", m.get("id", "")),
                    "context_length": m.get("context_length"),
                })
            models.sort(key=lambda x: x["id"])
            return {"models": models}
        elif provider == "sarvam":
            api_key = integ.get("sarvam_api_key", "")
            base_url = (integ.get("sarvam_base_url") or "").rstrip("/")
            if base_url:
                models_url = base_url + ("/models" if base_url.endswith("/v1") else "/v1/models")
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        resp = await client.get(models_url, headers={"Authorization": f"Bearer {api_key}"})
                        resp.raise_for_status()
                        data = resp.json()
                    models = []
                    for m in data.get("data", []):
                        mid = m.get("id", "")
                        models.append({"id": mid, "name": m.get("name", mid), "context_length": m.get("context_length")})
                    if models:
                        models.sort(key=lambda x: x["id"])
                        return {"models": models}
                except Exception:
                    pass
            return {"models": [
                {"id": "glm5.2", "name": "GLM 5.2", "context_length": 32000},
            ]}
        else:
            raise HTTPException(status_code=400, detail="Unknown provider")
    except httpx.HTTPError:
        return {"models": [], "error": "Failed to fetch models from provider"}
