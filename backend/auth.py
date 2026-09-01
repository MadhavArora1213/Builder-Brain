import os
import uuid
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, EmailStr

from db import db, audit

JWT_ALGORITHM = "HS256"
router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookie(response: Response, token: str):
    is_secure = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=is_secure,
        samesite="none" if is_secure else "lax",
        max_age=604800,
        path="/",
    )


def _client_id() -> str:
    import random, string
    return "".join(random.choices(string.ascii_lowercase, k=12))


def public_user(u: dict) -> dict:
    return {
        "id": u["id"], "email": u["email"], "name": u.get("name", ""),
        "role": u.get("role", "user"), "picture": u.get("picture", ""),
        "mcp_client_id": u.get("mcp_client_id", ""),
        "created_at": u.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    name: str = ""


class LoginBody(BaseModel):
    email: EmailStr
    password: str


async def _create_user(email: str, name: str, password: str = None,
                       picture: str = "", role: str = "user") -> dict:
    doc = {
        "id": str(uuid.uuid4()),
        "email": email.lower(),
        "name": name or email.split("@")[0],
        "role": role,
        "picture": picture,
        "mcp_client_id": _client_id(),
        "auth_provider": "google" if password is None else "password",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if password is not None:
        doc["password_hash"] = hash_password(password)
    await db.users.insert_one(doc)
    return doc


@router.post("/register")
async def register(body: RegisterBody, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = await _create_user(email, body.name, body.password)
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    await audit(user["id"], "register", {"email": email})
    return {"user": public_user(user), "token": token}


@router.post("/login")
async def login(body: LoginBody, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    now = datetime.now(timezone.utc)

    if user and user.get("locked_until"):
        try:
            lu = datetime.fromisoformat(user["locked_until"])
        except Exception:
            lu = None
        if lu and lu > now:
            raise HTTPException(status_code=423,
                                detail="Account temporarily locked after too many failed attempts. Try again later.")

    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        if user:
            attempts = user.get("failed_attempts", 0) + 1
            updates = {"failed_attempts": attempts}
            if attempts >= 5:
                updates["locked_until"] = (now + timedelta(minutes=15)).isoformat()
                updates["failed_attempts"] = 0
            await db.users.update_one({"email": email}, {"$set": updates})
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.users.update_one({"email": email}, {"$set": {"failed_attempts": 0, "locked_until": None}})
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    await audit(user["id"], "login", {"email": email})
    return {"user": public_user(user), "token": token}


class GoogleBody(BaseModel):
    session_id: str


@router.post("/google")
async def google_login(body: GoogleBody, response: Response):
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Google auth failed")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = await _create_user(email, data.get("name", ""), password=None,
                                  picture=data.get("picture", ""))
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    await audit(user["id"], "google_login", {"email": email})
    return {"user": public_user(user), "token": token}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


async def seed_admin():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await _create_user(admin_email, "Grizon Admin", admin_password, role="admin")
    else:
        updates = {}
        if not verify_password(admin_password, existing.get("password_hash", "")):
            updates["password_hash"] = hash_password(admin_password)
        if existing.get("role") != "admin":
            updates["role"] = "admin"
        if not existing.get("mcp_client_id"):
            updates["mcp_client_id"] = _client_id()
        if updates:
            await db.users.update_one({"email": admin_email}, {"$set": updates})
