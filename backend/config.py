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
    }


async def update_integrations(fields: dict):
    clean = {k: v for k, v in fields.items()
             if k in ("sarvam_api_key", "sarvam_base_url", "sarvam_model", 
                     "openrouter_api_key", "openrouter_base_url", "openrouter_model",
                     "mcp_url", "mcp_token") and v is not None}
    
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
