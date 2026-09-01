import os
import logging
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import init_indexes
from auth import router as auth_router, seed_admin
from projects_router import router as projects_router
from builder_router import router as builder_router
from admin_router import router as admin_router
from seed import seed_skills, seed_config

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("grizon")

app = FastAPI(title="Grizon AI")

health = APIRouter(prefix="/api")


@health.get("/")
async def root():
    return {"message": "Grizon AI backend running"}


app.include_router(health)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(builder_router)
app.include_router(admin_router)


def get_allowed_origins():
    raw = os.environ.get("CORS_ORIGINS") or os.environ.get("FRONTEND_URL") or "*"
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or ["*"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await init_indexes()
    await seed_admin()
    await seed_skills()
    await seed_config()
    logger.info("Grizon AI startup complete")
