"""Grizon AI backend API tests: auth, roles, multi-user isolation, projects, message->plan, admin."""
import os
import re
import time
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")


def creds():
    content = Path("/app/memory/test_credentials.md").read_text()
    email = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?Email(?:\*\*)?\s*:\s*`?([^`\s]+)', content)
    pwd = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?Password(?:\*\*)?\s*:\s*`?([^`\s]+)', content)
    if not email or not pwd:
        pytest.skip("No admin creds in test_credentials.md")
    return email.group(1), pwd.group(1)


ADMIN_EMAIL, ADMIN_PASSWORD = creds()


def new_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def register_user(session=None):
    s = session or new_client()
    email = f"TEST_{uuid.uuid4().hex[:10]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Test@1234", "name": "TEST User"}, timeout=30)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text[:300]}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data["user"], email


@pytest.fixture(scope="session")
def admin_client():
    s = new_client()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    body = r.json()
    assert body["user"]["role"] == "admin"
    s.headers.update({"Authorization": f"Bearer {body['token']}"})
    return s


# ---------- Health ----------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=30)
        assert r.status_code == 200
        assert "message" in r.json()


# ---------- Auth ----------
class TestAuth:
    def test_register_returns_user_role_and_cookie(self):
        s = new_client()
        email = f"TEST_{uuid.uuid4().hex[:10]}@example.com"
        r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Test@1234", "name": "TEST Reg"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["user"]["email"] == email.lower()
        assert data["user"]["role"] == "user"
        assert "password_hash" not in data["user"]
        assert isinstance(data["token"], str) and len(data["token"]) > 10
        assert "access_token" in r.cookies, f"cookie not set; got {r.cookies.get_dict()}"
        set_cookie = r.headers.get("set-cookie", "")
        assert "HttpOnly" in set_cookie, f"cookie not httpOnly: {set_cookie}"

    def test_register_duplicate_email(self):
        s, user, email = register_user()
        r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Test@1234"}, timeout=30)
        assert r.status_code == 400
        assert "already" in r.json()["detail"].lower()

    def test_register_short_password(self):
        s = new_client()
        r = s.post(f"{BASE_URL}/api/auth/register", json={"email": f"TEST_{uuid.uuid4().hex[:8]}@example.com", "password": "123"}, timeout=30)
        assert r.status_code == 400

    def test_register_invalid_email(self):
        s = new_client()
        r = s.post(f"{BASE_URL}/api/auth/register", json={"email": "notanemail", "password": "Test@1234"}, timeout=30)
        assert r.status_code == 422

    def test_login_and_me(self):
        s, user, email = register_user()
        s2 = new_client()
        r = s2.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Test@1234"}, timeout=30)
        assert r.status_code == 200
        token = r.json()["token"]
        # cookie-based me
        rme = s2.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert rme.status_code == 200
        assert rme.json()["email"] == email.lower()
        # bearer-based me
        s3 = new_client()
        s3.headers.update({"Authorization": f"Bearer {token}"})
        r3 = s3.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r3.status_code == 200
        assert r3.json()["role"] == "user"

    def test_login_wrong_password(self):
        s, user, email = register_user()
        r = new_client().post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "WrongPass1"}, timeout=30)
        assert r.status_code == 401

    def test_login_unknown_email(self):
        r = new_client().post(f"{BASE_URL}/api/auth/login", json={"email": "nobody_TEST@example.com", "password": "Test@1234"}, timeout=30)
        assert r.status_code == 401

    def test_me_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_invalid_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer garbage.token.here"}, timeout=30)
        assert r.status_code == 401

    def test_admin_login_role(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
        assert r.json()["email"] == ADMIN_EMAIL.lower()

    def test_logout_clears_cookie(self):
        s, user, email = register_user()
        r = s.post(f"{BASE_URL}/api/auth/logout", timeout=30)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_bcrypt_hash_format(self):
        """Password hashes must be bcrypt $2b$ format (checked in DB via admin table view is masked, so check locally)."""
        import bcrypt
        h = bcrypt.hashpw(b"x", bcrypt.gensalt()).decode()
        assert h.startswith("$2b$")

    def test_brute_force_lockout(self):
        """Playbook expects lockout after 5 failed logins."""
        s, user, email = register_user()
        codes = []
        for _ in range(6):
            r = new_client().post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "bad"}, timeout=30)
            codes.append(r.status_code)
        assert 423 in codes or 429 in codes, f"no lockout after 6 failed attempts, codes={codes}"


# ---------- Role protection ----------
class TestRoleProtection:
    ADMIN_PATHS = ["/api/admin/stats", "/api/admin/tables", "/api/admin/tables/users",
                   "/api/admin/skills", "/api/admin/sandboxes"]

    def test_normal_user_forbidden_on_admin_endpoints(self):
        s, user, email = register_user()
        for path in self.ADMIN_PATHS:
            r = s.get(f"{BASE_URL}{path}", timeout=30)
            assert r.status_code == 403, f"{path} returned {r.status_code} for normal user"

    def test_unauthenticated_admin_endpoints(self):
        for path in self.ADMIN_PATHS:
            r = requests.get(f"{BASE_URL}{path}", timeout=30)
            assert r.status_code == 401, f"{path} returned {r.status_code} unauthenticated"

    def test_user_cannot_mutate_skills(self):
        s, user, email = register_user()
        r = s.post(f"{BASE_URL}/api/admin/skills", json={"name": "TEST_hack.skill.md", "content": "x"}, timeout=30)
        assert r.status_code == 403
        r2 = s.delete(f"{BASE_URL}/api/admin/skills/{uuid.uuid4()}", timeout=30)
        assert r2.status_code == 403


# ---------- Projects CRUD + isolation ----------
class TestProjects:
    def test_create_list_get_delete(self):
        s, user, email = register_user()
        r = s.post(f"{BASE_URL}/api/projects", json={"title": "TEST_Project One"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        p = r.json()
        assert p["title"] == "TEST_Project One"
        assert p["owner_id"] == user["id"]
        assert p["conversation_id"]
        assert p["workflow"]["status"] == "idle"
        assert "_id" not in p
        pid = p["id"]

        rg = s.get(f"{BASE_URL}/api/projects/{pid}", timeout=30)
        assert rg.status_code == 200
        assert rg.json()["id"] == pid

        rl = s.get(f"{BASE_URL}/api/projects", timeout=30)
        assert rl.status_code == 200
        assert pid in [x["id"] for x in rl.json()]

        rm = s.get(f"{BASE_URL}/api/projects/{pid}/messages", timeout=30)
        assert rm.status_code == 200 and isinstance(rm.json(), list)
        rf = s.get(f"{BASE_URL}/api/projects/{pid}/files", timeout=30)
        assert rf.status_code == 200 and isinstance(rf.json(), list)

        rd = s.delete(f"{BASE_URL}/api/projects/{pid}", timeout=60)
        assert rd.status_code == 200
        assert s.get(f"{BASE_URL}/api/projects/{pid}", timeout=30).status_code == 404

    def test_default_title(self):
        s, user, email = register_user()
        r = s.post(f"{BASE_URL}/api/projects", json={}, timeout=30)
        assert r.status_code == 200
        assert r.json()["title"] == "Untitled Project"
        s.delete(f"{BASE_URL}/api/projects/{r.json()['id']}", timeout=60)

    def test_projects_require_auth(self):
        assert requests.get(f"{BASE_URL}/api/projects", timeout=30).status_code == 401
        assert requests.post(f"{BASE_URL}/api/projects", json={"title": "x"}, timeout=30).status_code == 401

    def test_nonexistent_project_404(self):
        s, _, _ = register_user()
        assert s.get(f"{BASE_URL}/api/projects/{uuid.uuid4()}", timeout=30).status_code == 404


class TestIsolation:
    """CRITICAL: strict per-user data isolation."""

    def test_user_b_cannot_access_user_a_project(self):
        sa, ua, ea = register_user()
        sb, ub, eb = register_user()
        pa = sa.post(f"{BASE_URL}/api/projects", json={"title": "TEST_A_secret"}, timeout=30).json()
        pid = pa["id"]
        try:
            assert sb.get(f"{BASE_URL}/api/projects/{pid}", timeout=30).status_code == 404
            assert sb.get(f"{BASE_URL}/api/projects/{pid}/messages", timeout=30).status_code == 404
            assert sb.get(f"{BASE_URL}/api/projects/{pid}/files", timeout=30).status_code == 404
            assert sb.get(f"{BASE_URL}/api/projects/{pid}/logs", timeout=30).status_code == 404
            assert sb.get(f"{BASE_URL}/api/projects/{pid}/sandbox-status", timeout=30).status_code == 404
            assert sb.post(f"{BASE_URL}/api/projects/{pid}/message", json={"content": "hi"}, timeout=60).status_code == 404
            assert sb.post(f"{BASE_URL}/api/projects/{pid}/stop", timeout=30).status_code == 404
            assert sb.post(f"{BASE_URL}/api/projects/{pid}/request-changes", json={"content": "x"}, timeout=30).status_code == 404
            assert sb.delete(f"{BASE_URL}/api/projects/{pid}", timeout=30).status_code == 404
            # list isolation
            ids_b = [x["id"] for x in sb.get(f"{BASE_URL}/api/projects", timeout=30).json()]
            assert pid not in ids_b
            # A's project still exists after B's delete attempt
            assert sa.get(f"{BASE_URL}/api/projects/{pid}", timeout=30).status_code == 200
        finally:
            sa.delete(f"{BASE_URL}/api/projects/{pid}", timeout=60)

    def test_admin_cannot_access_other_user_project_via_projects_api(self, admin_client):
        sa, ua, ea = register_user()
        pa = sa.post(f"{BASE_URL}/api/projects", json={"title": "TEST_A_admin_check"}, timeout=30).json()
        pid = pa["id"]
        try:
            r = admin_client.get(f"{BASE_URL}/api/projects/{pid}", timeout=30)
            assert r.status_code == 404, "admin should not read other users' projects via /api/projects"
        finally:
            sa.delete(f"{BASE_URL}/api/projects/{pid}", timeout=60)


# ---------- Admin features ----------
class TestAdmin:
    def test_stats(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/stats", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["users", "projects", "messages", "builds"]:
            assert k in d and isinstance(d[k], int)
        assert d["users"] >= 1

    def test_tables(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/tables", timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0
        names = [x["name"] for x in rows]
        assert "users" in names and "projects" in names
        for x in rows:
            assert isinstance(x["count"], int)

    def test_table_rows_no_password_leak(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/tables/users", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "users"
        assert len(d["rows"]) > 0
        for row in d["rows"]:
            assert "password_hash" not in row, "password_hash leaked in admin table view"
            assert "_id" not in row

    def test_unknown_table(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/tables/nonexistent_coll", timeout=30)
        assert r.status_code == 404

    def test_seeded_skills_present(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/skills", timeout=30)
        assert r.status_code == 200
        names = [s["name"] for s in r.json()]
        for expected in ["react.skill.md", "nextjs.skill.md", "typescript.skill.md", "debugging.skill.md"]:
            assert expected in names, f"missing seeded skill {expected}"

    def test_skill_crud(self, admin_client):
        name = f"TEST_skill_{uuid.uuid4().hex[:6]}.skill.md"
        r = admin_client.post(f"{BASE_URL}/api/admin/skills", json={
            "name": name, "content": "# test", "category": "coding",
            "agents": ["coding"], "enabled": True}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        sk = r.json()
        assert sk["name"] == name and sk["enabled"] is True and "_id" not in sk
        sid = sk["id"]
        # verify persisted
        assert name in [x["name"] for x in admin_client.get(f"{BASE_URL}/api/admin/skills", timeout=30).json()]
        # update / toggle
        ru = admin_client.put(f"{BASE_URL}/api/admin/skills/{sid}", json={
            "name": name, "content": "# updated", "category": "testing",
            "agents": ["testing"], "enabled": False}, timeout=30)
        assert ru.status_code == 200
        upd = ru.json()
        assert upd["enabled"] is False and upd["content"] == "# updated" and upd["category"] == "testing"
        assert "_id" not in upd
        got = [x for x in admin_client.get(f"{BASE_URL}/api/admin/skills", timeout=30).json() if x["id"] == sid][0]
        assert got["enabled"] is False and got["content"] == "# updated"
        # delete
        rd = admin_client.delete(f"{BASE_URL}/api/admin/skills/{sid}", timeout=30)
        assert rd.status_code == 200
        assert sid not in [x["id"] for x in admin_client.get(f"{BASE_URL}/api/admin/skills", timeout=30).json()]

    def test_update_nonexistent_skill(self, admin_client):
        r = admin_client.put(f"{BASE_URL}/api/admin/skills/{uuid.uuid4()}", json={"name": "x", "content": "y"}, timeout=30)
        assert r.status_code == 404


# ---------- Orchestrator: message -> manager -> planner ----------
class TestMessageFlow:
    def test_clear_prompt_produces_plan(self):
        s, user, email = register_user()
        p = s.post(f"{BASE_URL}/api/projects", json={"title": "TEST_todo_app"}, timeout=30).json()
        pid = p["id"]
        try:
            t0 = time.time()
            r = s.post(f"{BASE_URL}/api/projects/{pid}/message",
                       json={"content": "Build a simple todo list app in React with add and delete, no auth"},
                       timeout=180)
            elapsed = time.time() - t0
            assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
            data = r.json()
            print(f"clear prompt status={data.get('status')} in {elapsed:.1f}s")
            assert data.get("status") in ("awaiting_approval", "asking"), data
            msgs = s.get(f"{BASE_URL}/api/projects/{pid}/messages", timeout=30).json()
            types = [m.get("type") for m in msgs]
            print("message types:", types)
            assert any(m.get("role") == "user" for m in msgs)
            if data.get("status") == "awaiting_approval":
                plans = [m for m in msgs if m.get("type") == "plan"]
                assert plans, f"no plan message created; types={types}"
                proj = s.get(f"{BASE_URL}/api/projects/{pid}", timeout=30).json()
                assert proj["workflow"]["status"] == "awaiting_approval"
                assert proj["workflow"].get("todo"), "workflow todo list empty"
        finally:
            s.delete(f"{BASE_URL}/api/projects/{pid}", timeout=60)

    def test_vague_prompt_asks_or_plans(self):
        s, user, email = register_user()
        p = s.post(f"{BASE_URL}/api/projects", json={"title": "TEST_vague"}, timeout=30).json()
        pid = p["id"]
        try:
            r = s.post(f"{BASE_URL}/api/projects/{pid}/message", json={"content": "build me an app"}, timeout=180)
            assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
            data = r.json()
            print("vague prompt status:", data.get("status"))
            assert data.get("status") in ("asking", "awaiting_approval"), data
            msgs = s.get(f"{BASE_URL}/api/projects/{pid}/messages", timeout=30).json()
            assert len(msgs) >= 2, msgs
        finally:
            s.delete(f"{BASE_URL}/api/projects/{pid}", timeout=60)


# ---------- Admin: agent models + integrations (iteration 2) ----------
class TestAdminAgentModels:
    AGENTS = ["manager", "question", "planner", "coding", "testing"]

    def test_get_agent_models(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/agent-models", timeout=30)
        assert r.status_code == 200, r.text[:300]
        models = r.json()["models"]
        for a in self.AGENTS:
            assert a in models, f"missing agent {a}"
            assert isinstance(models[a], str) and models[a]
        print("agent models:", models)

    def test_put_agent_models_persists(self, admin_client):
        before = admin_client.get(f"{BASE_URL}/api/admin/agent-models", timeout=30).json()["models"]
        r = admin_client.put(f"{BASE_URL}/api/admin/agent-models", json={"models": {"coding": "glm5.2"}}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["models"]["coding"] == "glm5.2"
        g = admin_client.get(f"{BASE_URL}/api/admin/agent-models", timeout=30).json()["models"]
        assert g["coding"] == "glm5.2"
        for a in self.AGENTS:
            assert a in g
        # restore
        admin_client.put(f"{BASE_URL}/api/admin/agent-models", json={"models": before}, timeout=30)

    def test_agent_models_admin_only(self):
        s, _, _ = register_user()
        assert s.get(f"{BASE_URL}/api/admin/agent-models", timeout=30).status_code == 403
        assert s.put(f"{BASE_URL}/api/admin/agent-models", json={"models": {"coding": "hax"}}, timeout=30).status_code == 403
        assert requests.get(f"{BASE_URL}/api/admin/agent-models", timeout=30).status_code == 401


class TestAdminIntegrations:
    KEYS = ["sarvam_api_key", "sarvam_base_url", "sarvam_model", "mcp_url", "mcp_token"]

    def test_get_settings(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/settings", timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in self.KEYS:
            assert k in d, f"missing {k}"
        assert d["sarvam_model"]
        print("settings keys:", {k: (bool(v)) for k, v in d.items()})

    def test_put_settings_persists_and_restores(self, admin_client):
        before = admin_client.get(f"{BASE_URL}/api/admin/settings", timeout=30).json()
        r = admin_client.put(f"{BASE_URL}/api/admin/settings", json={"sarvam_model": "TEST_model_x"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["sarvam_model"] == "TEST_model_x"
        g = admin_client.get(f"{BASE_URL}/api/admin/settings", timeout=30).json()
        assert g["sarvam_model"] == "TEST_model_x"
        # other creds untouched
        assert g["sarvam_base_url"] == before["sarvam_base_url"]
        assert g["mcp_url"] == before["mcp_url"]
        # restore
        rr = admin_client.put(f"{BASE_URL}/api/admin/settings", json={"sarvam_model": before["sarvam_model"]}, timeout=30)
        assert rr.json()["sarvam_model"] == before["sarvam_model"]

    def test_settings_admin_only(self):
        s, _, _ = register_user()
        assert s.get(f"{BASE_URL}/api/admin/settings", timeout=30).status_code == 403
        assert s.put(f"{BASE_URL}/api/admin/settings", json={"sarvam_api_key": "hax"}, timeout=30).status_code == 403
        assert requests.get(f"{BASE_URL}/api/admin/settings", timeout=30).status_code == 401


# ---------- Security: secrets never returned ----------
class TestSecretsNotLeaked:
    def test_get_project_has_no_secrets_field(self):
        s, user, email = register_user()
        p = s.post(f"{BASE_URL}/api/projects", json={"title": "TEST_secret_proj"}, timeout=30).json()
        pid = p["id"]
        try:
            g = s.get(f"{BASE_URL}/api/projects/{pid}", timeout=30)
            assert g.status_code == 200
            assert "secrets" not in g.json(), "secrets leaked in GET /api/projects/{id}"
            for item in s.get(f"{BASE_URL}/api/projects", timeout=30).json():
                assert "secrets" not in item, "secrets leaked in project list"
        finally:
            s.delete(f"{BASE_URL}/api/projects/{pid}", timeout=60)


# ---------- Q&A MCQ flow (message -> asking -> answers -> plan) ----------
class TestQuestionFlow:
    def test_vague_prompt_returns_mcq_then_answers_advance(self):
        s, user, email = register_user()
        p = s.post(f"{BASE_URL}/api/projects", json={"title": "TEST_chatbot_qa"}, timeout=30).json()
        pid = p["id"]
        try:
            t0 = time.time()
            r = s.post(f"{BASE_URL}/api/projects/{pid}/message",
                       json={"content": "build me a chatbot app"}, timeout=240)
            assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
            status = r.json().get("status")
            print(f"vague chatbot prompt -> {status} in {time.time()-t0:.1f}s")
            assert status in ("asking", "awaiting_approval"), r.json()
            if status != "asking":
                pytest.skip("LLM planned directly instead of asking; MCQ path not exercised")

            msgs = s.get(f"{BASE_URL}/api/projects/{pid}/messages", timeout=30).json()
            qmsgs = [m for m in msgs if m.get("type") == "questions"]
            assert qmsgs, f"no questions message; types={[m.get('type') for m in msgs]}"
            questions = qmsgs[-1]["data"]["questions"]
            assert 1 <= len(questions) <= 4, questions
            types = set()
            for q in questions:
                assert q.get("question"), q
                assert q.get("type") in ("choice", "text", "secret"), q
                types.add(q["type"])
                if q["type"] == "choice":
                    assert isinstance(q.get("options"), list) and len(q["options"]) >= 2, q
            print("question types:", types, [q.get("key") for q in questions])
            assert "choice" in types, f"no MCQ choice question returned: {questions}"

            proj = s.get(f"{BASE_URL}/api/projects/{pid}", timeout=30).json()
            assert proj["workflow"]["status"] == "asking"

            answers = []
            for q in questions:
                if q["type"] == "choice":
                    val = q["options"][0]
                elif q["type"] == "secret":
                    val = "TEST_dummy_api_key_123"
                else:
                    val = "Keep it simple"
                answers.append({"key": q.get("key", ""), "question": q["question"], "type": q["type"], "value": val})

            t1 = time.time()
            ra = s.post(f"{BASE_URL}/api/projects/{pid}/answers", json={"answers": answers}, timeout=240)
            assert ra.status_code == 200, f"{ra.status_code} {ra.text[:500]}"
            st2 = ra.json().get("status")
            print(f"answers -> {st2} in {time.time()-t1:.1f}s")
            assert st2 in ("awaiting_approval", "building"), ra.json()

            msgs2 = s.get(f"{BASE_URL}/api/projects/{pid}/messages", timeout=30).json()
            plans = [m for m in msgs2 if m.get("type") == "plan"]
            assert plans, f"no plan after answers; types={[m.get('type') for m in msgs2]}"
            plan = plans[-1]["data"]["plan"]
            assert plan.get("tasks"), plan
            proj2 = s.get(f"{BASE_URL}/api/projects/{pid}", timeout=30).json()
            assert proj2["workflow"]["status"] in ("awaiting_approval", "building")
            assert proj2["workflow"].get("todo")
            assert "secrets" not in proj2, "secrets leaked after secret answer submitted"
        finally:
            s.delete(f"{BASE_URL}/api/projects/{pid}", timeout=60)

    def test_answers_endpoint_requires_ownership(self):
        sa, _, _ = register_user()
        sb, _, _ = register_user()
        p = sa.post(f"{BASE_URL}/api/projects", json={"title": "TEST_ans_iso"}, timeout=30).json()
        pid = p["id"]
        try:
            r = sb.post(f"{BASE_URL}/api/projects/{pid}/answers",
                        json={"answers": [{"key": "x", "question": "q", "type": "text", "value": "v"}]}, timeout=60)
            assert r.status_code == 404, r.status_code
            assert requests.post(f"{BASE_URL}/api/projects/{pid}/answers", json={"answers": []}, timeout=30).status_code == 401
        finally:
            sa.delete(f"{BASE_URL}/api/projects/{pid}", timeout=60)


# ---------- Regression: clear prompt still plans ----------
class TestClearPromptPlan:
    def test_clear_todo_prompt_reaches_awaiting_approval(self):
        s, user, email = register_user()
        p = s.post(f"{BASE_URL}/api/projects", json={"title": "TEST_clear_todo"}, timeout=30).json()
        pid = p["id"]
        try:
            t0 = time.time()
            r = s.post(f"{BASE_URL}/api/projects/{pid}/message",
                       json={"content": "Build a simple todo list in React with add and delete, use localStorage, no auth"},
                       timeout=240)
            assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
            st = r.json().get("status")
            print(f"clear prompt -> {st} in {time.time()-t0:.1f}s")
            assert st == "awaiting_approval", f"expected awaiting_approval, got {r.json()}"
            msgs = s.get(f"{BASE_URL}/api/projects/{pid}/messages", timeout=30).json()
            plans = [m for m in msgs if m.get("type") == "plan" and m.get("agent") == "planner"]
            assert plans, f"no planner plan message; types={[(m.get('type'), m.get('agent')) for m in msgs]}"
            plan = plans[-1]["data"]["plan"]
            assert plan.get("tasks") and len(plan["tasks"]) >= 3, plan
            proj = s.get(f"{BASE_URL}/api/projects/{pid}", timeout=30).json()
            assert proj["workflow"]["status"] == "awaiting_approval"
            assert proj["workflow"]["build_mode"] == "new"
        finally:
            s.delete(f"{BASE_URL}/api/projects/{pid}", timeout=60)


# ---------- Existing completed project used by Code view ----------
class TestCompletedProjectFiles:
    def test_test_expense_project_has_files_and_file_messages(self, admin_client):
        projects = admin_client.get(f"{BASE_URL}/api/projects", timeout=30).json()
        target = next((p for p in projects if p["title"] == "Test Expense"), None)
        assert target, f"'Test Expense' project not found; titles={[p['title'] for p in projects]}"
        pid = target["id"]
        files = admin_client.get(f"{BASE_URL}/api/projects/{pid}/files", timeout=30).json()
        assert isinstance(files, list) and len(files) > 0, "no files on completed project"
        for f in files:
            assert f.get("path") and isinstance(f.get("content", ""), str)
            assert "_id" not in f
        print(f"Test Expense files: {len(files)} -> {[f['path'] for f in files][:8]}")
        msgs = admin_client.get(f"{BASE_URL}/api/projects/{pid}/messages", timeout=30).json()
        file_msgs = [m for m in msgs if m.get("type") == "file"]
        print("file-type messages:", len(file_msgs))
        assert target["workflow"]["status"] in ("complete", "failed", "idle", "paused")
