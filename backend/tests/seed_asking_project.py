"""Create an admin-owned project stuck in 'asking' state for UI QuestionCard testing."""
import os
import requests
from dotenv import dotenv_values

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@grizon.ai", "password": "Grizon@2026"}, timeout=30)
r.raise_for_status()
s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
p = s.post(f"{BASE}/api/projects", json={"title": "TEST_UI_asking"}, timeout=30).json()
pid = p["id"]
res = s.post(f"{BASE}/api/projects/{pid}/message", json={"content": "build me a chatbot app"}, timeout=300)
print("project_id", pid, "status", res.status_code, res.json())
msgs = s.get(f"{BASE}/api/projects/{pid}/messages", timeout=30).json()
q = [m for m in msgs if m.get("type") == "questions"]
print("questions:", q[-1]["data"]["questions"] if q else None)
