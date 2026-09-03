"""SQLAlchemy ORM models for Grizon AI"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import Column, String, Integer, DateTime, Boolean, Text, JSON, ForeignKey, Index, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import uuid


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String)
    role = Column(String, default="user")  # user, admin
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # Account lockout fields
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    
    # MCP client
    mcp_client_id = Column(String, nullable=True)
    
    # Relations
    projects = relationship("Project", back_populates="owner", foreign_keys="Project.owner_id")
    
    __table_args__ = (
        Index("idx_user_email", "email"),
    )


class GithubConnection(Base):
    __tablename__ = "github_connections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    installation_id = Column(String, nullable=True)
    account_login = Column(String, nullable=False)
    access_token = Column(Text, nullable=True)
    repository = Column(String, nullable=True)
    branch = Column(String, nullable=False, default="main")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class SupabaseConnection(Base):
    __tablename__ = "supabase_connections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    access_token = Column(Text, nullable=False)
    project_ref = Column(String, nullable=True)
    project_name = Column(String, nullable=True)
    project_url = Column(String, nullable=True)
    anon_key = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    preview_url = Column(String, nullable=True)
    session_id = Column(String, nullable=True)
    secrets = Column(JSON, default={})
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # Workflow state
    workflow = Column(JSON, default={"status": "idle", "current_stage": None})
    
    # Relations
    owner = relationship("User", back_populates="projects", foreign_keys=[owner_id])
    messages = relationship("Message", back_populates="project", cascade="all, delete-orphan")
    files = relationship("ProjectFile", back_populates="project", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_project_owner", "owner_id"),
    )


class Message(Base):
    __tablename__ = "messages"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(String, nullable=True)
    conversation_id = Column(String, nullable=True)
    role = Column(String)  # user, assistant, system
    agent = Column(String)  # manager, question, planner, coding, testing
    type = Column(String)  # text, plan, questions, code, etc
    content = Column(Text)
    data = Column(JSON, nullable=True)  # Structured data for plans, questions, etc
    created_at = Column(DateTime, default=utcnow)
    
    # Relations
    project = relationship("Project", back_populates="messages")
    
    __table_args__ = (
        Index("idx_message_project", "project_id"),
    )


class ProjectFile(Base):
    __tablename__ = "project_files"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    path = Column(String, nullable=False)
    content = Column(Text)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # Relations
    project = relationship("Project", back_populates="files")
    
    __table_args__ = (
        Index("idx_projectfile_project", "project_id"),
        UniqueConstraint("project_id", "path", name="uq_project_file_path"),
    )


class Skill(Base):
    __tablename__ = "skills"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False, index=True)
    content = Column(Text, default="")
    description = Column(Text)
    category = Column(String)
    agents = Column(JSON, default=["coding"])
    enabled = Column(Boolean, default=True)
    config = Column(JSON, default={})
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class SystemConfig(Base):
    __tablename__ = "system_config"
    
    id = Column(String, primary_key=True, default="config")
    integrations = Column(JSON, default={})  # API keys, endpoints
    agent_models = Column(JSON, default={})  # Agent model/provider assignments
    settings = Column(JSON, default={})
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class Event(Base):
    __tablename__ = "events"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    kind = Column(String)  # build_started, file_created, etc
    data = Column(JSON, default={})
    created_at = Column(DateTime, default=utcnow, index=True)
    
    __table_args__ = (
        Index("idx_event_user_project", "user_id", "project_id"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String)
    detail = Column(JSON, default={})
    created_at = Column(DateTime, default=utcnow, index=True)
    
    __table_args__ = (
        Index("idx_auditlog_user", "user_id"),
    )


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    identifier = Column(String, index=True)  # email or IP
    success = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="running")  # running, done, error
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class SandboxSession(Base):
    __tablename__ = "sandbox_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    sandbox_name = Column(String, nullable=True)
    tunnel_url = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class AgentExecution(Base):
    __tablename__ = "agent_executions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    agent = Column(String)
    status = Column(String, default="running")
    created_at = Column(DateTime, default=utcnow)
