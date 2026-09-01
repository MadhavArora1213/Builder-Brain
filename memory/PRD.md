# Grizon AI — Product Requirements Document

## Original Problem Statement
Build a multi-user AI full-stack app builder (like Lovable/Emergent) named **Grizon AI**. Core loop:
user prompt → Q&A agent (if needed) → AI coding agents → generate/edit a real app → run in the
NemoClaw sandbox → live preview → user requests changes → agent edits → run again. Multi-user with
USER and ADMIN roles and strict per-user data isolation. Admin dashboard shows DB tables and a Skills
manager. Sandbox via NemoClaw MCP tools. LLM = Sarvam `glm5.2`.

## Architecture (as built in this environment)
- **Frontend**: React + Tailwind (parchment/earthy theme, Cormorant Garamond + IBM Plex Mono + Inter).
- **Backend**: FastAPI + LangGraph orchestration.
- **DB**: MongoDB (user chose MongoDB over Postgres for this environment) with all requested collections:
  users, projects, conversations, messages, project_files, agent_executions, workflow_runs,
  sandbox_sessions, checkpoints, memories, events, agent_prompts, skills, system_config, audit_logs.
- **LLM**: Sarvam `glm5.2` (OpenAI-compatible) via `llm.py`.
- **Sandbox**: NemoClaw MCP (`mcp_client.py`) — save_code, execute_in_sandbox, get_sandbox_status,
  get_sandbox_logs, list_sandboxes, delete_sandbox, execute_workspace_archive.

## Agents (LangGraph — `orchestrator.py`)
- **Manager**: intent classification (NEW/MODIFY/CHAT), clarification decision, next-agent routing.
- **Question**: structured clarifying questions when requirements are insufficient.
- **Planner**: structured JSON plan + ordered TODO.
- **Coding**: generates minimal runnable app files (delimited format), saves to sandbox via save_code.
- **Testing**: verifies run + produces PRD; failures loop back to Coding (max 2 retries).
- Build/test loop runs as a background LangGraph StateGraph; state persisted per project.

## User Personas
- **Builder (USER)**: describes apps, approves plans, watches live preview, requests changes.
- **ADMIN**: everything a user can do + system DB browser + skill.md management.

## Core Requirements (static)
- JWT email/password auth + Emergent Google login; USER/ADMIN roles; brute-force lockout.
- Strict per-user isolation on every project/conversation/message/file/sandbox query.
- Sandbox entrypoint contract: full-stack → `frontend/src/main.tsx`; single-service → server file on 9999;
  Next.js → `package.json`. Tunnel URL auto-saved and shown in Live Preview; never fabricated.
- On project close/delete → `delete_sandbox` for that project's session only.

## Implemented (2026-06)
- Auth (register/login/me/logout/google), roles, brute-force lockout (423 after 5 fails).
- Projects/conversations/messages CRUD with ownership isolation; project delete tears down sandbox.
- Full agent loop verified end-to-end: prompt → plan → approve → code → NemoClaw sandbox →
  live tunnel preview → testing PASS → PRD (built a working React+Vite+Express expense tracker live).
- Builder UI: 40/60 split, agent timeline, plan/question/PRD cards, logs pane, Stop/Retry/Refresh,
  auto-updating live preview iframe.
- Home: rotating greeting, chat input, previous projects grid.
- Admin dashboard: stats, DB table browser (password_hash hidden), Skills CRUD + enable/disable + agent scoping.
- Seeded 4 coding skills + admin user + system_config.

## Backlog / Remaining
- P1: Real-time streaming (WebSocket) instead of 3s polling.
- P1: Persist full LangGraph checkpoints to `checkpoints` for true resume-after-restart.
- P2: shadcn AlertDialog for destructive actions; richer error/loading states.
- P2: Admin system-wide sandbox monitor; per-agent prompt editor via `agent_prompts`.
- P2: Memories/events surfaced in UI.

## Next Tasks
- Add WebSocket streaming of agent messages/logs.
- Expand Testing Agent to actually probe the tunnel URL (HTTP checks per feature).

## Iteration 2 (2026-06)
- Chat auto-scroll fixed (holds position when user scrolls up); Preview shows a "Preview is building…"
  overlay instead of a "refused to connect" iframe while a build/restart is in progress.
- Right pane now has a Preview / Code toggle: Code view shows the live file tree + source of files the
  Coding agent is writing; per-file streaming messages and file chips are clickable to open a file.
- Question Agent redesigned: asks multiple-choice questions, a database question (SQLite/PostgreSQL/none)
  when CRUD is needed, and a secret API-key question when an external API is required. Answers submitted
  via a structured card; API keys stored securely (project.secrets, never returned) and injected into the
  backend env of the generated app only.
- Targeted modifications: follow-ups set build_mode=modify, inject existing files, and change ONLY what
  was asked (verified: "change background to navy" updated 2 files, not the whole app; self-healing retry).
- Admin dashboard: Agents tab (per-agent model config, read dynamically at run time) and Integrations tab
  (editable Sarvam + NemoClaw MCP credentials). Models/credentials are no longer hard-coded.
- Verified: 43/43 backend tests pass; targeted-modify build reached PASS end-to-end.
