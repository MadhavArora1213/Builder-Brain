import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from db import AsyncSessionLocal
from models import Skill, SystemConfig

DEFAULT_SKILLS = [
    {"name": "react.skill.md", "category": "coding",
     "content": "# React\n- Use function components and hooks.\n- Keep components small.\n- Use Vite for dev.\n"},
    {"name": "nextjs.skill.md", "category": "coding",
     "content": "# Next.js\n- App router in src/app.\n- Use API routes for backend.\n- TypeScript by default.\n"},
    {"name": "typescript.skill.md", "category": "coding",
     "content": "# TypeScript\n- Enable strict mode.\n- Type all props and API responses.\n"},
    {"name": "debugging.skill.md", "category": "coding",
     "content": "# Debugging\n- Read sandbox logs first.\n- Fix root cause, minimal changes.\n- Re-run after each fix.\n"},
]


async def seed_skills():
    async with AsyncSessionLocal() as session:
        for s in DEFAULT_SKILLS:
            result = await session.execute(select(Skill).filter(Skill.name == s["name"]))
            exists = result.scalars().first()
            if not exists:
                skill = Skill(
                    id=str(uuid.uuid4()),
                    name=s["name"],
                    description=s.get("content", ""),
                    category=s.get("category", ""),
                    config={},
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                session.add(skill)
        await session.commit()


async def seed_config():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SystemConfig).filter(SystemConfig.id == "config"))
        exists = result.scalars().first()
        if not exists:
            config = SystemConfig(
                id="config",
                integrations={},
                agent_models={},
                settings={},
                updated_at=datetime.utcnow(),
            )
            session.add(config)
            await session.commit()
