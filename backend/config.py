"""Runtime configuration (models + integration credentials) editable by admins.
Values are stored in system_config and fall back to environment variables.
"""
import os
from db import db

AGENTS = ["manager", "question", "planner", "coding", "testing"]


async def get_integrations() -> dict:
    doc = await db.system_config.find_one({"key": "integrations"}, {"_id": 0}) or {}
    return {
        "sarvam_api_key": doc.get("sarvam_api_key") or os.environ.get("SARVAM_API_KEY", ""),
        "sarvam_base_url": doc.get("sarvam_base_url") or os.environ.get("SARVAM_BASE_URL", ""),
        "sarvam_model": doc.get("sarvam_model") or os.environ.get("SARVAM_MODEL", "glm5.2"),
        "mcp_url": doc.get("mcp_url") or os.environ.get("SANDBOX_MCP_URL", ""),
        "mcp_token": doc.get("mcp_token") or os.environ.get("SANDBOX_MCP_TOKEN", ""),
    }


async def update_integrations(fields: dict):
    clean = {k: v for k, v in fields.items()
             if k in ("sarvam_api_key", "sarvam_base_url", "sarvam_model", "mcp_url", "mcp_token") and v is not None}
    await db.system_config.update_one({"key": "integrations"},
                                      {"$set": {"key": "integrations", **clean}}, upsert=True)


async def get_agent_models() -> dict:
    doc = await db.system_config.find_one({"key": "agent_models"}, {"_id": 0}) or {}
    integ = await get_integrations()
    default = integ["sarvam_model"]
    models = doc.get("models", {})
    return {a: models.get(a) or default for a in AGENTS}


async def get_agent_model(agent: str) -> str:
    models = await get_agent_models()
    return models.get(agent) or "glm5.2"


async def set_agent_models(models: dict):
    clean = {a: models[a] for a in AGENTS if a in models and models[a]}
    await db.system_config.update_one({"key": "agent_models"},
                                      {"$set": {"key": "agent_models", "models": clean}}, upsert=True)
