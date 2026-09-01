import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import db, audit
import mcp_client as mcp

router = APIRouter(prefix="/api/projects", tags=["projects"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def owned_project(project_id: str, user: dict) -> dict:
    project = await db.projects.find_one({"id": project_id, "owner_id": user["id"]}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class CreateProject(BaseModel):
    title: str = "Untitled Project"


@router.post("")
async def create_project(body: CreateProject, user: dict = Depends(get_current_user)):
    pid = str(uuid.uuid4())
    conv_id = str(uuid.uuid4())
    project = {
        "id": pid,
        "owner_id": user["id"],
        "title": body.title or "Untitled Project",
        "conversation_id": conv_id,
        "session_id": uuid.uuid4().hex,   # sandbox session id
        "preview_url": None,
        "workflow": {"status": "idle", "current_agent": None, "requirements": "",
                     "plan": None, "todo": [], "approval_status": None,
                     "test_status": None, "retry_count": 0, "stop_requested": False},
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one({**project})
    await db.conversations.insert_one({
        "id": conv_id, "project_id": pid, "owner_id": user["id"],
        "title": project["title"], "created_at": now_iso(),
    })
    await audit(user["id"], "create_project", {"project_id": pid})
    project.pop("_id", None)
    return project


@router.get("")
async def list_projects(user: dict = Depends(get_current_user)):
    projects = await db.projects.find({"owner_id": user["id"]}, {"_id": 0, "secrets": 0}).sort("updated_at", -1).to_list(200)
    return projects


@router.get("/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    project.pop("secrets", None)
    return project


@router.get("/{project_id}/messages")
async def get_messages(project_id: str, user: dict = Depends(get_current_user)):
    await owned_project(project_id, user)
    msgs = await db.messages.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return msgs


@router.get("/{project_id}/files")
async def get_files(project_id: str, user: dict = Depends(get_current_user)):
    await owned_project(project_id, user)
    files = await db.project_files.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    return files


@router.delete("/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    # Tear down the sandbox for this project only.
    try:
        await mcp.delete_sandbox(project["session_id"], user.get("mcp_client_id", "grizon"))
    except Exception:
        pass
    await db.projects.delete_one({"id": project_id, "owner_id": user["id"]})
    for coll in ["conversations", "messages", "project_files",
                 "agent_executions", "workflow_runs", "sandbox_sessions",
                 "checkpoints", "events"]:
        await db[coll].delete_many({"project_id": project_id})
    await audit(user["id"], "delete_project", {"project_id": project_id})
    return {"ok": True}
