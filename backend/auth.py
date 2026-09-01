import os
import uuid
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from db import AsyncSessionLocal, audit
from models import User

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
        "id": u.get("id"), "email": u.get("email"), "name": u.get("name", ""),
        "role": u.get("role", "user"), "created_at": u.get("created_at"),
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
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).filter(User.id == payload["sub"]))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {
            "id": user.id, "email": user.email, "name": user.name or "",
            "role": user.role, "created_at": user.created_at.isoformat(),
            "password_hash": user.password_hash,
            "failed_attempts": user.failed_attempts,
            "locked_until": user.locked_until.isoformat() if user.locked_until else None,
        }


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
    async with AsyncSessionLocal() as session:
        user = User(
            id=str(uuid.uuid4()),
            email=email.lower(),
            name=name or email.split("@")[0],
            role=role,
            password_hash=hash_password(password) if password else "",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return {
            "id": user.id, "email": user.email, "name": user.name,
            "role": user.role, "created_at": user.created_at.isoformat(),
        }


@router.post("/register")
async def register(body: RegisterBody, response: Response):
    email = body.email.lower()
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).filter(User.email == email))
        existing = result.scalars().first()
        if existing:
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
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).filter(User.email == email))
        user = result.scalars().first()
        
        now = datetime.utcnow()
        
        if user and user.locked_until:
            if user.locked_until > now:
                raise HTTPException(status_code=423,
                                    detail="Account temporarily locked after too many failed attempts. Try again later.")
        
        if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
            if user:
                attempts = (user.failed_attempts or 0) + 1
                if attempts >= 5:
                    user.locked_until = now + timedelta(minutes=15)
                    user.failed_attempts = 0
                else:
                    user.failed_attempts = attempts
                await session.commit()
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        user.failed_attempts = 0
        user.locked_until = None
        await session.commit()
    
    token = create_access_token(user.id, email)
    set_auth_cookie(response, token)
    await audit(user.id, "login", {"email": email})
    return {"user": public_user({"id": user.id, "email": user.email, "name": user.name, "role": user.role, "created_at": user.created_at.isoformat()}), "token": token}


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
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).filter(User.email == email))
        user = result.scalars().first()
    if not user:
        user = await _create_user(email, data.get("name", ""), password=None,
                                  picture=data.get("picture", ""))
    else:
        user = {"id": user.id, "email": user.email, "name": user.name or "",
                "role": user.role, "created_at": user.created_at.isoformat()}
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
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).filter(User.email == admin_email))
        existing = result.scalars().first()
        
        if existing is None:
            await _create_user(admin_email, "Grizon Admin", admin_password, role="admin")
        else:
            if not verify_password(admin_password, existing.password_hash or ""):
                existing.password_hash = hash_password(admin_password)
            if existing.role != "admin":
                existing.role = "admin"
            await session.commit()
