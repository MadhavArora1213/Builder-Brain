"""Database setup and session management for PostgreSQL with SQLAlchemy"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from models import Base, User, Project, Message, ProjectFile, Skill, SystemConfig, Event, AuditLog, WorkflowRun, SandboxSession, AgentExecution, GithubConnection, SupabaseConnection

# PostgreSQL connection string - use DATABASE_URL env var or construct from components
DATABASE_URL = os.environ.get("DATABASE_URL") or (
    f"postgresql+asyncpg://{os.environ.get('DB_USER', 'postgres')}:"
    f"{os.environ.get('DB_PASSWORD', 'password')}@"
    f"{os.environ.get('DB_HOST', 'localhost')}:"
    f"{os.environ.get('DB_PORT', '5432')}/"
    f"{os.environ.get('DB_NAME', 'grizon_ai')}"
)

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    poolclass=NullPool,
    future=True,
)

# Session factory
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    """Dependency for FastAPI to get DB session"""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    """Create all tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(
            "ALTER TABLE github_connections ADD COLUMN IF NOT EXISTS access_token TEXT"
        ))


async def init_indexes():
    """Create indexes (already handled by SQLAlchemy table definitions)"""
    pass


async def log_event(user_id: str, project_id: str, kind: str, data: dict):
    """Log an event to the database"""
    async with AsyncSessionLocal() as session:
        event = Event(
            user_id=user_id,
            project_id=project_id,
            kind=kind,
            data=data,
        )
        session.add(event)
        await session.commit()


async def audit(user_id: str, action: str, detail: dict):
    """Log an audit entry to the database"""
    async with AsyncSessionLocal() as session:
        log = AuditLog(
            user_id=user_id,
            action=action,
            detail=detail,
        )
        session.add(log)
        await session.commit()


MANAGED_COLLECTIONS = ["users", "projects", "messages", "project_files", "skills",
                       "system_config", "events", "audit_logs", "workflow_runs",
                       "sandbox_sessions", "agent_executions", "github_connections",
                       "supabase_connections"]
