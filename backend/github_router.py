"""GitHub App installation, repository selection, and project publishing."""
import base64
import os
import time
import uuid
from datetime import datetime
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select

from auth import get_current_user, get_jwt_secret
from db import AsyncSessionLocal, audit
from models import GithubConnection, ProjectFile
from projects_router import owned_project

router = APIRouter(prefix="/api/github", tags=["github"])
GITHUB_API = "https://api.github.com"


def _app_private_key() -> str:
    path = os.environ.get("GITHUB_APP_PRIVATE_KEY_PATH", "").strip()
    if not path:
        raise HTTPException(status_code=503, detail="GitHub App private key is not configured")
    try:
        with open(path, "r", encoding="utf-8") as key_file:
            return key_file.read()
    except OSError as exc:
        raise HTTPException(status_code=503, detail="GitHub App private key could not be read") from exc


def _app_jwt() -> str:
    app_id = os.environ.get("GITHUB_APP_ID", "").strip()
    if not app_id:
        raise HTTPException(status_code=503, detail="GitHub App ID is not configured")
    now = int(time.time())
    return jwt.encode({"iat": now - 60, "exp": now + 540, "iss": app_id},
                      _app_private_key(), algorithm="RS256")


def _frontend_url() -> str:
    return (os.environ.get("FRONTEND_URL") or
            os.environ.get("CORS_ORIGINS", "").split(",")[0] or
            "http://localhost:3000").strip().rstrip("/")


def _signed_state(user_id: str) -> str:
    now = int(time.time())
    return jwt.encode({"sub": user_id, "iat": now, "exp": now + 600, "nonce": uuid.uuid4().hex},
                      get_jwt_secret(), algorithm="HS256")


def _state_user(state: str) -> str:
    try:
        payload = jwt.decode(state, get_jwt_secret(), algorithms=["HS256"])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=400, detail="Invalid or expired GitHub connection state") from exc
    return payload["sub"]


def _oauth_config() -> tuple[str, str]:
    client_id = os.environ.get("GITHUB_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GITHUB_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail="GitHub OAuth client ID and secret are not configured")
    return client_id, client_secret


async def _github_request(method: str, url: str, token: str = None, **kwargs):
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.request(method, url, headers=headers, **kwargs)
    if response.is_error:
        detail = response.json().get("message", "GitHub request failed")
        raise HTTPException(status_code=502, detail=f"GitHub ({response.status_code}): {detail}")
    return response.json() if response.content else {}


async def _installation_token(installation_id: str) -> str:
    data = await _github_request(
        "POST", f"{GITHUB_API}/app/installations/{installation_id}/access_tokens",
        token=_app_jwt())
    return data["token"]


async def _connection(user_id: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(GithubConnection).filter(GithubConnection.user_id == user_id))
        return result.scalars().first()


def _repository_name(value: str) -> str:
    return value.strip().strip("/").removesuffix(".git")


@router.get("/connect")
async def connect(request: Request, user: dict = Depends(get_current_user)):
    slug = os.environ.get("GITHUB_APP_SLUG", "").strip()
    if not slug:
        raise HTTPException(status_code=503, detail="GitHub App slug is not configured")
    state = _signed_state(user["id"])
    callback_url = os.environ.get("GITHUB_APP_CALLBACK_URL", "").strip()
    callback_url = callback_url or f"{str(request.base_url).rstrip('/')}/api/github/callback"
    params = urlencode({"state": state, "redirect_uri": callback_url})
    return {"url": f"https://github.com/apps/{slug}/installations/new?{params}"}


@router.get("/callback")
async def callback(state: str = Query(...), installation_id: str = Query(...)):
    user_id = _state_user(state)
    app_installation = await _github_request(
        "GET", f"{GITHUB_API}/app/installations/{installation_id}", token=_app_jwt())
    account = app_installation.get("account") or {}
    login = account.get("login")
    if not login:
        raise HTTPException(status_code=502, detail="GitHub installation has no account")
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(GithubConnection).filter(GithubConnection.user_id == user_id))
        connection = result.scalars().first()
        if connection:
            connection.installation_id = installation_id
            connection.account_login = login
            connection.updated_at = datetime.utcnow()
        else:
            session.add(GithubConnection(user_id=user_id, installation_id=installation_id, account_login=login))
        await session.commit()
    await audit(user_id, "github_connected", {"account": login})
    from fastapi.responses import RedirectResponse
    return RedirectResponse(f"{_frontend_url()}/settings?github=connected")


@router.get("/oauth/connect")
async def oauth_connect(request: Request, user: dict = Depends(get_current_user)):
    client_id, _ = _oauth_config()
    callback_url = os.environ.get("GITHUB_OAUTH_CALLBACK_URL", "").strip()
    callback_url = callback_url or f"{str(request.base_url).rstrip('/')}/api/github/oauth/callback"
    params = urlencode({"client_id": client_id, "redirect_uri": callback_url,
                        "scope": "repo", "state": _signed_state(user["id"])})
    return {"url": f"https://github.com/login/oauth/authorize?{params}"}


@router.get("/oauth/callback")
async def oauth_callback(code: str = Query(...), state: str = Query(...)):
    user_id = _state_user(state)
    client_id, client_secret = _oauth_config()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            json={"client_id": client_id, "client_secret": client_secret, "code": code},
        )
    if response.is_error:
        raise HTTPException(status_code=502, detail="GitHub OAuth token exchange failed")
    token_data = response.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail=token_data.get(
            "error_description", "GitHub OAuth authorization failed"))
    profile = await _github_request("GET", f"{GITHUB_API}/user", token=access_token)
    login = profile.get("login")
    if not login:
        raise HTTPException(status_code=502, detail="GitHub OAuth returned no account")
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(GithubConnection).filter(GithubConnection.user_id == user_id))
        connection = result.scalars().first()
        if connection:
            connection.access_token = access_token
            connection.account_login = login
            connection.updated_at = datetime.utcnow()
        else:
            session.add(GithubConnection(user_id=user_id, account_login=login, access_token=access_token))
        await session.commit()
    await audit(user_id, "github_oauth_authorized", {"account": login})
    from fastapi.responses import RedirectResponse
    return RedirectResponse(f"{_frontend_url()}/settings?github=authorized")


@router.get("/connection")
async def connection(user: dict = Depends(get_current_user)):
    item = await _connection(user["id"])
    if not item:
        return {"connected": False}
    return {"connected": True, "account_login": item.account_login,
            "repository": item.repository, "branch": item.branch,
            "user_authorized": bool(item.access_token)}


@router.get("/repositories")
async def repositories(user: dict = Depends(get_current_user)):
    item = await _connection(user["id"])
    if not item:
        raise HTTPException(status_code=400, detail="Connect GitHub first")
    token = await _installation_token(item.installation_id)
    data = await _github_request("GET", f"{GITHUB_API}/installation/repositories", token=token,
                                 params={"per_page": 100})
    return [{"full_name": repo["full_name"], "default_branch": repo.get("default_branch") or "main"}
            for repo in data.get("repositories", [])]


class RepositorySelection(BaseModel):
    repository: str
    branch: str = "main"


class RepositoryCreate(BaseModel):
    name: str
    description: str = ""
    private: bool = True


@router.post("/repositories")
async def create_repository(body: RepositoryCreate, user: dict = Depends(get_current_user)):
    item = await _connection(user["id"])
    if not item:
        raise HTTPException(status_code=400, detail="Connect GitHub first")
    name = body.name.strip()
    if not name or len(name) > 100:
        raise HTTPException(status_code=400, detail="Repository name must be 1-100 characters")
    if not item.access_token:
        raise HTTPException(status_code=428, detail="Authorize GitHub before creating a repository")
    token = item.access_token
    try:
        repo = await _github_request(
            "POST", f"{GITHUB_API}/user/repos", token=token,
            json={"name": name, "description": body.description.strip(),
                  "private": body.private, "auto_init": True})
    except HTTPException as exc:
        if exc.status_code == 502 and "Resource not accessible by integration" in str(exc.detail):
            detail = (
                "GitHub App permission missing: enable Administration: Read and write "
                "under the App's Repository permissions, save, then reinstall the App."
            )
        else:
            detail = str(exc.detail)
        raise HTTPException(
            status_code=400,
            detail=f"GitHub repository creation failed: {detail}"
        ) from exc
    item.repository = repo["full_name"]
    item.branch = repo.get("default_branch") or "main"
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(GithubConnection).filter(GithubConnection.user_id == user["id"]))
        stored = result.scalars().first()
        stored.repository = item.repository
        stored.branch = item.branch
        await session.commit()
    await audit(user["id"], "github_repository_created", {"repository": item.repository})
    return {"full_name": item.repository, "default_branch": item.branch}


@router.put("/connection")
async def select_repository(body: RepositorySelection, user: dict = Depends(get_current_user)):
    item = await _connection(user["id"])
    if not item:
        raise HTTPException(status_code=400, detail="Connect GitHub first")
    token = await _installation_token(item.installation_id)
    repos = await _github_request("GET", f"{GITHUB_API}/installation/repositories", token=token,
                                  params={"per_page": 100})
    allowed = {repo["full_name"] for repo in repos.get("repositories", [])}
    if body.repository not in allowed:
        raise HTTPException(status_code=400, detail="Repository is not available to this GitHub App")
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(GithubConnection).filter(GithubConnection.user_id == user["id"]))
        item = result.scalars().first()
        item.repository = body.repository
        item.branch = body.branch.strip() or "main"
        await session.commit()
    return {"repository": item.repository, "branch": item.branch}


@router.delete("/connection")
async def disconnect(user: dict = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(GithubConnection).filter(GithubConnection.user_id == user["id"]))
        item = result.scalars().first()
        if item:
            await session.delete(item)
            await session.commit()
    await audit(user["id"], "github_disconnected", {})
    return {"ok": True}


async def publish_project(project_id: str, owner_id: str) -> dict:
    item = await _connection(owner_id)
    if not item or not item.repository:
        return {"status": "skipped", "reason": "GitHub repository is not configured"}
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(ProjectFile).filter(ProjectFile.project_id == project_id))
        files = result.scalars().all()
    if not files:
        return {"status": "skipped", "reason": "Project has no generated files"}
    if not item.access_token:
        raise HTTPException(status_code=428, detail="Authorize GitHub before publishing")
    repository = _repository_name(item.repository)
    token = item.access_token
    repository_url = f"{GITHUB_API}/repos/{repository}"
    repository_info = await _github_request("GET", repository_url, token=token)
    branch = item.branch or repository_info.get("default_branch") or "main"
    for file in files:
        path = file.path.lstrip("/")
        file_url = f"{repository_url}/contents/{path}"
        existing_sha = None
        try:
            existing = await _github_request(
                "GET", file_url, token=token, params={"ref": branch}
            )
            existing_sha = existing.get("sha")
        except HTTPException as exc:
            if "(404)" not in str(exc.detail):
                raise
        payload = {
            "message": f"Publish {project_id}: {path}",
            "content": base64.b64encode((file.content or "").encode("utf-8")).decode("ascii"),
            "branch": branch,
        }
        if existing_sha:
            payload["sha"] = existing_sha
        await _github_request("PUT", file_url, token=token, json=payload)
    return {"status": "published", "repository": repository, "branch": branch}


@router.post("/projects/{project_id}/publish")
async def publish(project_id: str, user: dict = Depends(get_current_user)):
    await owned_project(project_id, user)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ProjectFile).filter(ProjectFile.project_id == project_id)
        )
        if not result.scalars().first():
            raise HTTPException(status_code=400, detail="Project has no generated files")
    result = await publish_project(project_id, user["id"])
    if result["status"] != "published":
        raise HTTPException(status_code=400, detail=result["reason"])
    return result
