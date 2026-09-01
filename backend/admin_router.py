import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_admin
from db import db, MANAGED_COLLECTIONS
import config
import mcp_client as mcp

router = APIRouter(prefix="/api/admin", tags=["admin"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@router.get("/stats")
async def stats(admin: dict = Depends(require_admin)):
    users = await db.users.count_documents({})
    projects = await db.projects.count_documents({})
    messages = await db.messages.count_documents({})
    builds = await db.workflow_runs.count_documents({})
    return {"users": users, "projects": projects, "messages": messages, "builds": builds}


@router.get("/tables")
async def tables(admin: dict = Depends(require_admin)):
    out = []
    for name in MANAGED_COLLECTIONS:
        count = await db[name].count_documents({})
        out.append({"name": name, "count": count})
    return out


@router.get("/tables/{name}")
async def table_rows(name: str, admin: dict = Depends(require_admin)):
    if name not in MANAGED_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown table")
    rows = await db[name].find({}, {"_id": 0, "password_hash": 0}).limit(100).to_list(100)
    return {"name": name, "rows": rows}


# ---- Skills management ----
class SkillBody(BaseModel):
    name: str
    content: str = ""
    category: str = "coding"
    agents: list = ["coding"]
    enabled: bool = True


@router.get("/skills")
async def list_skills(admin: dict = Depends(require_admin)):
    return await db.skills.find({}, {"_id": 0}).sort("name", 1).to_list(200)


@router.post("/skills")
async def create_skill(body: SkillBody, admin: dict = Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), "name": body.name, "content": body.content,
           "category": body.category, "agents": body.agents, "enabled": body.enabled,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.skills.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.put("/skills/{skill_id}")
async def update_skill(skill_id: str, body: SkillBody, admin: dict = Depends(require_admin)):
    res = await db.skills.update_one({"id": skill_id}, {"$set": {
        "name": body.name, "content": body.content, "category": body.category,
        "agents": body.agents, "enabled": body.enabled, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Skill not found")
    return await db.skills.find_one({"id": skill_id}, {"_id": 0})


@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str, admin: dict = Depends(require_admin)):
    await db.skills.delete_one({"id": skill_id})
    return {"ok": True}


@router.get("/sandboxes")
async def all_sandboxes(admin: dict = Depends(require_admin)):
    sessions = await db.sandbox_sessions.find({}, {"_id": 0}).to_list(200)
    return {"sandboxes": sessions}


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
