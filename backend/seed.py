import uuid
from datetime import datetime, timezone
from db import db

DEFAULT_SKILLS = [
    {"name": "react.skill.md", "category": "coding", "agents": ["coding"],
     "content": "# React\n- Use function components and hooks.\n- Keep components small.\n- Use Vite for dev.\n"},
    {"name": "nextjs.skill.md", "category": "coding", "agents": ["coding"],
     "content": "# Next.js\n- App router in src/app.\n- Use API routes for backend.\n- TypeScript by default.\n"},
    {"name": "typescript.skill.md", "category": "coding", "agents": ["coding"],
     "content": "# TypeScript\n- Enable strict mode.\n- Type all props and API responses.\n"},
    {"name": "debugging.skill.md", "category": "coding", "agents": ["coding", "testing"],
     "content": "# Debugging\n- Read sandbox logs first.\n- Fix root cause, minimal changes.\n- Re-run after each fix.\n"},
]


async def seed_skills():
    for s in DEFAULT_SKILLS:
        exists = await db.skills.find_one({"name": s["name"]})
        if not exists:
            await db.skills.insert_one({
                "id": str(uuid.uuid4()), "enabled": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(), **s})


async def seed_config():
    exists = await db.system_config.find_one({"key": "app"})
    if not exists:
        await db.system_config.insert_one({
            "id": str(uuid.uuid4()), "key": "app", "app_name": "Grizon AI",
            "default_stack": "vite-react-express-ts", "max_retries": 2,
            "created_at": datetime.now(timezone.utc).isoformat()})
