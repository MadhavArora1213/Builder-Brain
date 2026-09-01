from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_user
from db import db
from projects_router import owned_project
import mcp_client as mcp
import orchestrator as orch

router = APIRouter(prefix="/api/projects", tags=["builder"])


class MessageBody(BaseModel):
    content: str


class Answer(BaseModel):
    key: str = ""
    question: str = ""
    type: str = "text"
    value: str = ""


class AnswersBody(BaseModel):
    answers: list[Answer]


@router.post("/{project_id}/message")
async def send_message(project_id: str, body: MessageBody, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    return await orch.handle_user_message(project, body.content)


@router.post("/{project_id}/answers")
async def answers(project_id: str, body: AnswersBody, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    return await orch.submit_answers(project, [a.dict() for a in body.answers])


@router.post("/{project_id}/approve")
async def approve(project_id: str, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    return await orch.approve_and_build(project)


@router.post("/{project_id}/request-changes")
async def request_changes(project_id: str, body: MessageBody, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    return await orch.request_changes(project, body.content)


@router.post("/{project_id}/stop")
async def stop(project_id: str, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    await orch.stop_build(project)
    return {"status": "paused"}


@router.post("/{project_id}/retry")
async def retry(project_id: str, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    await orch.retry_build(project)
    return {"status": "building"}


@router.get("/{project_id}/logs")
async def logs(project_id: str, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    try:
        res = await mcp.get_sandbox_logs(project["session_id"], user.get("mcp_client_id", "grizon"))
        return {"logs": res.get("result", "") if isinstance(res, dict) else str(res)}
    except Exception as e:
        return {"logs": f"(logs unavailable: {e})"}


@router.get("/{project_id}/sandbox-status")
async def sandbox_status(project_id: str, user: dict = Depends(get_current_user)):
    project = await owned_project(project_id, user)
    try:
        res = await mcp.get_sandbox_status(project["session_id"], user.get("mcp_client_id", "grizon"))
    except Exception as e:
        return {"active": False, "error": str(e)}
    # Auto-update preview url if a new tunnel appeared
    tunnel = res.get("tunnel_url") if isinstance(res, dict) else None
    if tunnel and tunnel != project.get("preview_url"):
        await db.projects.update_one({"id": project_id}, {"$set": {"preview_url": tunnel}})
    return res


@router.get("/{project_id}/sandboxes")
async def my_sandboxes(project_id: str, user: dict = Depends(get_current_user)):
    await owned_project(project_id, user)
    try:
        return await mcp.list_sandboxes(user.get("mcp_client_id", "grizon"))
    except Exception as e:
        return {"sandboxes": [], "error": str(e)}
