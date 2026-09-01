"""Verify secret storage then clean up UI test fixtures."""
import asyncio

from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from db import db  # noqa: E402

ASKING = "3b2be00a-934a-4bac-a2d0-599af431628d"
BUILDING = "3788ad91-9884-4699-b474-1f06b37a3662"


async def main():
    p = await db.projects.find_one({"id": ASKING}, {"_id": 0, "secrets": 1, "workflow.status": 1, "workflow.build_mode": 1})
    print("asking project secrets keys:", list((p.get("secrets") or {}).keys()), "status:", p["workflow"]["status"])
    for pid in (ASKING, BUILDING):
        await db.projects.delete_one({"id": pid})
        for coll in ["conversations", "messages", "project_files", "agent_executions",
                     "workflow_runs", "sandbox_sessions", "checkpoints", "events"]:
            await db[coll].delete_many({"project_id": pid})
    await db.messages.delete_one({"id": "TEST_file_msg"})
    left = await db.projects.count_documents({"title": {"$regex": "^TEST_"}})
    users = await db.users.count_documents({"email": {"$regex": "^test_"}})
    print("remaining TEST_ projects:", left, "TEST users:", users)
    # purge leftover test users + their projects
    tu = await db.users.find({"email": {"$regex": "^test_"}}, {"_id": 0, "id": 1}).to_list(1000)
    ids = [u["id"] for u in tu]
    if ids:
        pr = await db.projects.find({"owner_id": {"$in": ids}}, {"_id": 0, "id": 1}).to_list(2000)
        pids = [x["id"] for x in pr]
        await db.projects.delete_many({"owner_id": {"$in": ids}})
        for coll in ["conversations", "messages", "project_files", "agent_executions",
                     "workflow_runs", "sandbox_sessions", "checkpoints", "events"]:
            await db[coll].delete_many({"project_id": {"$in": pids}})
        await db.users.delete_many({"id": {"$in": ids}})
    print("cleaned test users:", len(ids))
    print("final projects:", await db.projects.count_documents({}), "users:", await db.users.count_documents({}))


asyncio.run(main())
