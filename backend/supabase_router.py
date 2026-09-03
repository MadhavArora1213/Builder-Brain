"""Supabase OAuth connection and project selection."""
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
from models import SupabaseConnection

router = APIRouter(prefix="/api/supabase", tags=["supabase"])
oauth_router = APIRouter(tags=["supabase"])
SUPABASE_API = "https://api.supabase.com"


def _frontend_url() -> str:
    return (os.environ.get("FRONTEND_URL") or
            os.environ.get("CORS_ORIGINS", "").split(",")[0] or
            "http://localhost:3000").strip().rstrip("/")


def _oauth_config() -> tuple[str, str]:
    client_id = os.environ.get("SUPABASE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("SUPABASE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail="Supabase OAuth credentials are not configured")
    return client_id, client_secret


def _signed_state(user_id: str) -> str:
    now = int(time.time())
    return jwt.encode({"sub": user_id, "iat": now, "exp": now + 600, "nonce": uuid.uuid4().hex},
                      get_jwt_secret(), algorithm="HS256")


def _state_user(state: str) -> str:
    try:
        payload = jwt.decode(state, get_jwt_secret(), algorithms=["HS256"])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=400, detail="Invalid or expired Supabase connection state") from exc
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid Supabase connection state")
    return user_id


async def _supabase_request(method: str, path: str, token: str, **kwargs):
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.request(
            method, f"{SUPABASE_API}{path}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            **kwargs,
        )
    if response.is_error:
        print("SUPABASE ERROR:", response.status_code, response.text)  # ADD THIS LINE
        try:
            detail = response.json().get("message", "Supabase request failed")
        except ValueError:
            detail = "Supabase request failed"
        raise HTTPException(status_code=502, detail=f"Supabase ({response.status_code}): {detail}")
    return response.json() if response.content else {}

async def _connection(user_id: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SupabaseConnection).filter(SupabaseConnection.user_id == user_id)
        )
        return result.scalars().first()


def _callback_url(request: Request) -> str:
    configured = os.environ.get("SUPABASE_REDIRECT_URI", "").strip()
    return configured or f"{str(request.base_url).rstrip('/')}/connect-supabase/oauth2/callback"


def _publishable_key(keys) -> str | None:
    """Extract a client-safe legacy anon key, falling back to publishable."""

    if isinstance(keys, dict):
        candidates = keys.get("keys") or keys.get("api_keys") or keys.get("data") or []
    elif isinstance(keys, list):
        candidates = keys
    else:
        candidates = []

    if not isinstance(candidates, list):
        return None

    fallback = None
    for key in candidates:
        if not isinstance(key, dict):
            continue

        key_name = str(key.get("name") or "").strip().lower().replace("_", " ")
        key_type = str(key.get("type") or "").strip().lower()
        api_key = key.get("api_key") or key.get("key") or key.get("value")

        # Safe debug information — NEVER print api_key itself.
        print(
            "SUPABASE KEY:",
            {
                "name": key_name,
                "type": key_type,
                "prefix": key.get("prefix"),
                "has_api_key": bool(api_key),
            },
        )

        if not isinstance(api_key, str) or not api_key.strip():
            continue
        if key_name in ("anon", "anon key") or key_type == "anon":
            return api_key.strip()
        if (
            key_type == "publishable"
            or key_name in ("publishable", "publishable key")
        ) and fallback is None:
            fallback = api_key.strip()

    return fallback


@router.get("/connect")
async def connect(request: Request, user: dict = Depends(get_current_user)):
    client_id, _ = _oauth_config()
    params = urlencode({
        "client_id": client_id,
        "redirect_uri": _callback_url(request),
        "response_type": "code",
        "scope": "secrets:read",
        "state": _signed_state(user["id"]),
    })
    return {"url": f"{SUPABASE_API}/v1/oauth/authorize?{params}"}


@router.get("/connection")
async def connection(user: dict = Depends(get_current_user)):
    item = await _connection(user["id"])
    if not item:
        return {"connected": False}
    return {
        "connected": True,
        "project_ref": item.project_ref,
        "project_name": item.project_name,
        "project_url": item.project_url,
        "project_selected": bool(item.project_ref),
    }


@router.get("/projects")
async def projects(user: dict = Depends(get_current_user)):
    item = await _connection(user["id"])
    if not item:
        raise HTTPException(status_code=400, detail="Connect Supabase first")
    data = await _supabase_request("GET", "/v1/projects", item.access_token)
    return [
        {"ref": project.get("ref"), "name": project.get("name"), "region": project.get("region"),
         "status": project.get("status")}
        for project in data if project.get("ref")
    ]


class ProjectSelection(BaseModel):
    project_ref: str


@router.put("/connection")
async def select_project(body: ProjectSelection, user: dict = Depends(get_current_user)):
    project_ref = body.project_ref.strip()
    if not project_ref or len(project_ref) > 64:
        raise HTTPException(status_code=400, detail="A valid Supabase project is required")
    item = await _connection(user["id"])
    if not item:
        raise HTTPException(status_code=400, detail="Connect Supabase first")
    projects_data = await _supabase_request("GET", "/v1/projects", item.access_token)
    project = next((p for p in projects_data if p.get("ref") == project_ref), None)
    if not project:
        raise HTTPException(status_code=400, detail="Supabase project is not available")

    # NEW: check project status before asking for its keys.
    status = str(project.get("status") or "").upper()
    if status and status != "ACTIVE_HEALTHY":
        raise HTTPException(
            status_code=409,
            detail=(
                f"This Supabase project is currently '{status}' (it may be paused or still "
                "starting up). Wait a minute for it to finish, then try selecting it again."
            ),
        )

    keys = await _supabase_request(
        "GET", f"/v1/projects/{project_ref}/api-keys", item.access_token,
        params={"reveal": "true"},
    )
    anon_key = _publishable_key(keys)
    if not anon_key:
        # NEW: friendlier message for the empty-keys case, now that we know
        # the project itself is healthy (so this means keys genuinely aren't provisioned).
        raise HTTPException(
            status_code=400,
            detail=(
                "This Supabase project doesn't have a publishable/anon API key yet. "
                "Open Project Settings \u2192 API Keys in the Supabase dashboard to enable one, "
                "then try again."
            ),
        )
    item.project_ref = project_ref
    item.project_name = project.get("name")
    item.project_url = f"https://{project_ref}.supabase.co"
    item.anon_key = anon_key
    item.updated_at = datetime.utcnow()
    async with AsyncSessionLocal() as session:
        stored = await session.get(SupabaseConnection, item.id)
        stored.project_ref = item.project_ref
        stored.project_name = item.project_name
        stored.project_url = item.project_url
        stored.anon_key = item.anon_key
        stored.updated_at = item.updated_at
        await session.commit()
    await audit(user["id"], "supabase_project_selected", {"project_ref": project_ref})
    return {"project_ref": item.project_ref, "project_name": item.project_name, "project_url": item.project_url}

@router.delete("/connection")
async def disconnect(user: dict = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SupabaseConnection).filter(SupabaseConnection.user_id == user["id"])
        )
        item = result.scalars().first()
        if item:
            await session.delete(item)
            await session.commit()
    await audit(user["id"], "supabase_disconnected", {})
    return {"ok": True}


@oauth_router.get("/connect-supabase/oauth2/callback", include_in_schema=False)
@router.get("/oauth2/callback", include_in_schema=False)
async def oauth_callback(request: Request, code: str = Query(...), state: str = Query(...)):
    user_id = _state_user(state)
    client_id, client_secret = _oauth_config()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{SUPABASE_API}/v1/oauth/token",
            data={"grant_type": "authorization_code", "code": code,
                  "client_id": client_id, "client_secret": client_secret,
                  "redirect_uri": _callback_url(request)},
            headers={"Accept": "application/json"},
        )
    if response.is_error:
        raise HTTPException(status_code=502, detail="Supabase OAuth token exchange failed")
    token_data = response.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="Supabase OAuth authorization failed")
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SupabaseConnection).filter(SupabaseConnection.user_id == user_id)
        )
        item = result.scalars().first()
        if item:
            item.access_token = access_token
            item.project_ref = item.project_name = item.project_url = item.anon_key = None
            item.updated_at = datetime.utcnow()
        else:
            session.add(SupabaseConnection(user_id=user_id, access_token=access_token))
        await session.commit()
    await audit(user_id, "supabase_connected", {})
    from fastapi.responses import RedirectResponse
    return RedirectResponse(f"{_frontend_url()}/settings?supabase=connected")


async def get_project_environment(user_id: str) -> dict:
    item = await _connection(user_id)
    if not item or not item.project_url or not item.anon_key:
        return {}
    return {"SUPABASE_URL": item.project_url, "SUPABASE_PUBLISHABLE_KEY": item.anon_key}


async def execute_project_sql(user_id: str, sql: str) -> dict:
    """Run generated schema SQL only against the user's selected project."""
    if not sql.strip():
        return {"status": "skipped", "reason": "Supabase SQL file is empty"}
    item = await _connection(user_id)
    if not item or not item.project_ref:
        return {"status": "skipped", "reason": "No Supabase project is selected"}
    await _supabase_request(
        "POST",
        f"/v1/projects/{item.project_ref}/database/query",
        item.access_token,
        json={"query": sql, "read_only": False},
    )
    return {"status": "applied", "project_ref": item.project_ref}
