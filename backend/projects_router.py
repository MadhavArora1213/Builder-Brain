import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload

from auth import get_current_user
from db import AsyncSessionLocal, audit
from models import Project, Message, ProjectFile
import mcp_client as mcp

router = APIRouter(prefix="/api/projects", tags=["projects"])


async def owned_project(project_id: str, user: dict) -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Project).filter(Project.id == project_id, Project.owner_id == user["id"])
        )
        project = result.scalars().first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return {
            "id": project.id,
            "owner_id": project.owner_id,
            "title": project.title,
            "preview_url": project.preview_url,
            "session_id": project.session_id,
            "secrets": project.secrets or {},
            "workflow": project.workflow,
            "created_at": project.created_at.isoformat(),
            "updated_at": project.updated_at.isoformat(),
        }


class CreateProject(BaseModel):
    title: str = "Untitled Project"


@router.post("")
async def create_project(body: CreateProject, user: dict = Depends(get_current_user)):
    pid = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    async with AsyncSessionLocal() as session:
        project = Project(
            id=pid,
            owner_id=user["id"],
            title=body.title or "Untitled Project",
            preview_url=None,
            session_id=session_id,
            workflow={"status": "idle", "current_agent": None, "requirements": "",
                     "plan": None, "todo": [], "approval_status": None,
                     "test_status": None, "retry_count": 0, "stop_requested": False},
            created_at=now,
            updated_at=now,
        )
        session.add(project)
        await session.commit()
        await session.refresh(project)
    
    await audit(user["id"], "create_project", {"project_id": pid})
    return {
        "id": project.id,
        "owner_id": project.owner_id,
        "title": project.title,
        "preview_url": project.preview_url,
        "workflow": project.workflow,
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat(),
    }


@router.get("")
async def list_projects(user: dict = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Project)
            .filter(Project.owner_id == user["id"])
            .order_by(Project.updated_at.desc())
        )
        projects = result.scalars().all()
    
    return [
        {
            "id": p.id,
            "owner_id": p.owner_id,
            "title": p.title,
            "preview_url": p.preview_url,
            "workflow": p.workflow,
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat(),
        }
        for p in projects
    ]


@router.get("/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    return await owned_project(project_id, user)


@router.get("/{project_id}/messages")
async def get_messages(project_id: str, user: dict = Depends(get_current_user)):
    await owned_project(project_id, user)
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Message)
            .filter(Message.project_id == project_id)
            .order_by(Message.created_at.asc())
        )
        messages = result.scalars().all()
    
    return [
        {
            "id": m.id,
            "project_id": m.project_id,
            "user_id": m.user_id,
            "role": m.role,
            "agent": m.agent,
            "type": m.type,
            "content": m.content,
            "data": m.data,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]


@router.get("/{project_id}/files")
async def get_files(project_id: str, user: dict = Depends(get_current_user)):
    await owned_project(project_id, user)
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ProjectFile).filter(ProjectFile.project_id == project_id)
        )
        files = result.scalars().all()
    
    return [
        {
            "id": f.id,
            "project_id": f.project_id,
            "path": f.path,
            "content": f.content,
            "created_at": f.created_at.isoformat(),
            "updated_at": f.updated_at.isoformat(),
        }
        for f in files
    ]


@router.delete("/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    project_dict = await owned_project(project_id, user)
    
    async with AsyncSessionLocal() as session:
        # Delete all related records
        await session.execute(delete(ProjectFile).filter(ProjectFile.project_id == project_id))
        await session.execute(delete(Message).filter(Message.project_id == project_id))
        await session.execute(delete(Project).filter(Project.id == project_id, Project.owner_id == user["id"]))
        await session.commit()
    
    await audit(user["id"], "delete_project", {"project_id": project_id})
    return {"ok": True}
