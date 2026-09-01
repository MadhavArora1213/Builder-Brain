import json
import httpx
import config


def _parse_sse(text: str):
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            payload = line[len("data:"):].strip()
            try:
                return json.loads(payload)
            except Exception:
                continue
    try:
        return json.loads(text)
    except Exception:
        return None


async def call_tool(name: str, arguments: dict, timeout: float = 300.0) -> dict:
    integ = await config.get_integrations()
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": f"Bearer {integ['mcp_token']}",
    }
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": name, "arguments": arguments}}
    async with httpx.AsyncClient(timeout=timeout) as http:
        r = await http.post(integ["mcp_url"], headers=headers, json=body)
        r.raise_for_status()
        data = _parse_sse(r.text)
    if not data:
        raise RuntimeError(f"MCP {name}: empty/unparseable response")
    if "error" in data:
        raise RuntimeError(f"MCP {name} error: {data['error']}")
    result = data.get("result", {})
    if isinstance(result, dict) and result.get("structuredContent") is not None:
        return result["structuredContent"]
    content = result.get("content") if isinstance(result, dict) else None
    if content and isinstance(content, list):
        txt = content[0].get("text", "")
        try:
            return json.loads(txt)
        except Exception:
            return {"text": txt}
    return result


async def save_code(session_id, filename, code, client_id):
    return await call_tool("save_code", {"session_id": session_id, "filename": filename,
                                         "code": code, "client_id": client_id}, timeout=120)


async def execute_in_sandbox(session_id, entrypoint, client_id):
    return await call_tool("execute_in_sandbox", {"session_id": session_id, "entrypoint": entrypoint,
                                                  "client_id": client_id}, timeout=300)


async def get_sandbox_status(session_id, client_id):
    return await call_tool("get_sandbox_status", {"session_id": session_id, "client_id": client_id}, timeout=60)


async def get_sandbox_logs(session_id, client_id):
    return await call_tool("get_sandbox_logs", {"session_id": session_id, "client_id": client_id}, timeout=60)


async def list_sandboxes(client_id):
    return await call_tool("list_sandboxes", {"client_id": client_id}, timeout=60)


async def delete_sandbox(session_id, client_id):
    return await call_tool("delete_sandbox", {"session_id": session_id, "client_id": client_id}, timeout=120)
