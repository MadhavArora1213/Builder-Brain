import json
import re
from openai import AsyncOpenAI
import config
from typing import AsyncGenerator


async def _client(provider: str = "sarvam"):
    """Get OpenAI-compatible client for Sarvam or OpenRouter"""
    integ = await config.get_integrations()
    if provider == "openrouter":
        return AsyncOpenAI(api_key=integ["openrouter_api_key"], base_url=integ["openrouter_base_url"]), integ["openrouter_model"]
    else:  # sarvam
        return AsyncOpenAI(api_key=integ["sarvam_api_key"], base_url=integ["sarvam_base_url"]), integ["sarvam_model"]


async def chat(system: str, user: str, temperature: float = 0.3, max_tokens: int = 16000, model: str = None, provider: str = "sarvam") -> str:
    client, default_model = await _client(provider)
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


async def chat_stream(system: str, user: str, temperature: float = 0.3, max_tokens: int = 16000, model: str = None, provider: str = "sarvam") -> AsyncGenerator[str, None]:
    """Streaming version of chat - yields chunks as they arrive."""
    client, default_model = await _client(provider)
    stream = await client.chat.completions.create(
        model=model or default_model,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


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


async def chat_json(system: str, user: str, temperature: float = 0.2, max_tokens: int = 16000, model: str = None, provider: str = "sarvam"):
    system = system + "\n\nYou MUST respond with ONLY valid JSON. No prose, no markdown fences."
    raw = await chat(system, user, temperature, max_tokens, model, provider)
    return extract_json(raw), raw
