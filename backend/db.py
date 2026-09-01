import os
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Collections that the Admin dashboard can browse
MANAGED_COLLECTIONS = [
    "users",
    "projects",
    "conversations",
    "messages",
    "project_files",
    "agent_executions",
    "workflow_runs",
    "sandbox_sessions",
    "checkpoints",
    "memories",
    "events",
    "agent_prompts",
    "skills",
    "system_config",
    "audit_logs",
]


async def init_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.projects.create_index("owner_id")
    await db.projects.create_index("id", unique=True)
    await db.conversations.create_index("project_id")
    await db.messages.create_index("project_id")
    await db.project_files.create_index("project_id")
    await db.skills.create_index("name")
    await db.login_attempts.create_index("identifier")


async def log_event(user_id: str, project_id: str, kind: str, data: dict):
    import uuid
    from datetime import datetime, timezone
    await db.events.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "project_id": project_id,
        "kind": kind,
        "data": data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def audit(user_id: str, action: str, detail: dict):
    import uuid
    from datetime import datetime, timezone
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "action": action,
        "detail": detail,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
