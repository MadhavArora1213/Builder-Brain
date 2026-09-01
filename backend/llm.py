import json
import re
from openai import AsyncOpenAI
import config


async def _client():
    integ = await config.get_integrations()
    return AsyncOpenAI(api_key=integ["sarvam_api_key"], base_url=integ["sarvam_base_url"]), integ["sarvam_model"]


async def chat(system: str, user: str, temperature: float = 0.3, max_tokens: int = 16000, model: str = None) -> str:
    client, default_model = await _client()
    resp = await client.chat.completions.create(
        model=model or default_model,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""


def extract_json(text: str):
    if not text:
        return None
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find("{"); end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    start = text.find("["); end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    return None


async def chat_json(system: str, user: str, temperature: float = 0.2, max_tokens: int = 16000, model: str = None):
    system = system + "\n\nYou MUST respond with ONLY valid JSON. No prose, no markdown fences."
    raw = await chat(system, user, temperature, max_tokens, model)
    return extract_json(raw), raw
