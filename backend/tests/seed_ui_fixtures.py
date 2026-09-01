"""Seed UI test fixtures: a 'file' type chat message on Test Expense + a project stuck in 'building'."""
import asyncio
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from db import db  # noqa: E402

TE = "21f75979-d49b-4fba-891e-289f4bcab828"


def now():
    return datetime.now(timezone.utc).isoformat()


async def main():
    te = await db.projects.find_one({"id": TE}, {"_id": 0, "conversation_id": 1, "owner_id": 1})
    mid = "TEST_file_msg"
    await db.messages.delete_one({"id": mid})
    await db.messages.insert_one({
        "id": mid, "project_id": TE, "conversation_id": te["conversation_id"],
        "owner_id": te["owner_id"], "role": "agent", "type": "file",
        "content": "frontend/src/App.tsx", "agent": "coding",
        "data": {"path": "frontend/src/App.tsx"}, "created_at": now(),
    })
    print("inserted file message", mid)

    # building-state project
    pid = str(uuid.uuid4())
    conv = str(uuid.uuid4())
    await db.projects.insert_one({
        "id": pid, "owner_id": te["owner_id"], "title": "TEST_UI_building",
        "conversation_id": conv, "session_id": uuid.uuid4().hex,
        "preview_url": "https://example.com",
        "workflow": {"status": "building", "current_agent": "coding", "requirements": "x",
                     "plan": None, "todo": [], "approval_status": "auto",
                     "test_status": None, "retry_count": 0, "stop_requested": False,
                     "build_mode": "new"},
        "created_at": now(), "updated_at": now(),
    })
    await db.conversations.insert_one({"id": conv, "project_id": pid, "owner_id": te["owner_id"],
                                       "title": "TEST_UI_building", "created_at": now()})
    print("building_project_id", pid)


asyncio.run(main())
