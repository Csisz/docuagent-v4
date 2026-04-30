"""
AI Engine for DocuAgent V4.
All LLM calls go through here — modules never call OpenAI directly.
"""
import asyncio
import json
import uuid
import logging
import httpx
from typing import Optional
from core.config import OPENAI_API_KEY

log = logging.getLogger("docuagent")

CHAT_URL      = "https://api.openai.com/v1/chat/completions"
EMBEDDING_URL = "https://api.openai.com/v1/embeddings"
EMBED_MODEL   = "text-embedding-3-small"

MODEL_MINI  = "gpt-4o-mini"
MODEL_SMART = "gpt-4o"

_COST_PER_1K = {
    MODEL_MINI:  0.00015,
    MODEL_SMART: 0.005,
}


def select_model(task_type: str, confidence_required: float = 0.0) -> str:
    if task_type in ("classify", "extract_entities", "summarize", "draft_reply", "extract", "general"):
        return MODEL_MINI
    if task_type in ("insights", "reply"):
        return MODEL_SMART
    return MODEL_MINI


def _auth_headers() -> dict:
    if not OPENAI_API_KEY.strip():
        log.error("OPENAI_API_KEY is not configured")
        raise RuntimeError("OPENAI_API_KEY is not configured")
    return {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }


async def _log_usage(model: str, task_type: str, tokens: int, tenant_id: Optional[str] = None) -> None:
    try:
        import core.database as db
        cost = round(tokens / 1000 * _COST_PER_1K.get(model, 0.00015), 6)
        tid  = uuid.UUID(tenant_id) if tenant_id else None
        await db.execute(
            """INSERT INTO ai_usage_log (id, tenant_id, model, task_type, tokens_used, cost_usd)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            uuid.uuid4(), tid, model, task_type, tokens, cost,
        )
    except Exception as e:
        log.debug(f"ai_usage_log insert failed: {e}")


async def _chat(
    messages: list,
    max_tokens: int = 800,
    json_mode: bool = False,
    task_type: str = "general",
    model: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> tuple[str, int]:
    """Internal chat completion with retry. Returns (content, tokens_used)."""
    chosen = model or select_model(task_type)
    body: dict = {
        "model":      chosen,
        "messages":   messages,
        "max_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    last_error = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(CHAT_URL, headers=_auth_headers(), json=body)
                r.raise_for_status()
                data    = r.json()
                content = data["choices"][0]["message"]["content"]
                tokens  = data.get("usage", {}).get("total_tokens", 0)

            log.debug(f"AI Engine: task={task_type} model={chosen} tokens={tokens}")
            asyncio.ensure_future(_log_usage(chosen, task_type, tokens, tenant_id))

            if tenant_id:
                try:
                    from core.metering import increment_usage
                    cost = round(tokens / 1000 * _COST_PER_1K.get(chosen, 0.00015), 6)
                    asyncio.ensure_future(increment_usage(tenant_id, "core", "tokens_consumed", int(tokens)))
                    asyncio.ensure_future(increment_usage(tenant_id, "core", "ai_calls_made", 1))
                    if cost > 0:
                        asyncio.ensure_future(increment_usage(tenant_id, "core", "cost_usd", cost))
                except Exception as e:
                    log.warning(f"metering failed: {e}")

            return content, tokens

        except (httpx.TimeoutException, httpx.ConnectError) as e:
            last_error = e
            if attempt < 2:
                wait = 2 ** attempt
                log.warning(f"OpenAI timeout attempt {attempt + 1}/3, retrying in {wait}s: {e}")
                await asyncio.sleep(wait)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 or e.response.status_code >= 500:
                last_error = e
                if attempt < 2:
                    wait = 2 ** attempt
                    log.warning(f"OpenAI HTTP {e.response.status_code} attempt {attempt + 1}/3, retrying in {wait}s")
                    await asyncio.sleep(wait)
            else:
                raise

    raise RuntimeError(f"OpenAI failed after 3 attempts: {last_error}")


async def embed(text: str) -> list[float]:
    """Text → embedding vector (text-embedding-3-small, 1536 dim)."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            EMBEDDING_URL,
            headers=_auth_headers(),
            json={"model": EMBED_MODEL, "input": text[:8000]},
        )
        r.raise_for_status()
        return r.json()["data"][0]["embedding"]


async def classify(
    text: str,
    categories: list[str],
    tenant_id: str,
    extra_instructions: str = "",
) -> dict:
    """
    Classify text into one of the given categories.
    Returns: {category, confidence, reasoning, sentiment, urgency_score}
    """
    cats = ", ".join(categories)
    system = (
        f"You are a text classifier. Classify the input into exactly one of: [{cats}]. "
        "Respond with JSON only: "
        '{"category": "<one of the categories>", "confidence": <0.0-1.0>, '
        '"reasoning": "<brief explanation>", "sentiment": "<positive|neutral|negative>", "urgency_score": <0.0-1.0>}. '
        + extra_instructions
    )
    content, _ = await _chat(
        messages=[{"role": "system", "content": system}, {"role": "user", "content": text[:4000]}],
        json_mode=True,
        task_type="classify",
        tenant_id=tenant_id,
    )
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"category": categories[0], "confidence": 0.0, "reasoning": content, "sentiment": "neutral", "urgency_score": 0.0}


async def extract(
    text: str,
    schema: dict,
    tenant_id: str,
    extra_instructions: str = "",
) -> dict:
    """
    Structured extraction. schema = {field_name: "type or description"}.
    Returns: {result: {schema fields filled}, confidence: float}
    Uses JSON mode.
    """
    schema_str = json.dumps(schema, ensure_ascii=False)
    system = (
        "You are a data extraction assistant. Extract structured data from the input text. "
        f"Return JSON matching this schema: {schema_str}. "
        'Wrap your output as: {"result": {<extracted fields>}, "confidence": <0.0-1.0>}. '
        "If a field cannot be found, set it to null. "
        + extra_instructions
    )
    content, _ = await _chat(
        messages=[{"role": "system", "content": system}, {"role": "user", "content": text[:6000]}],
        json_mode=True,
        task_type="extract",
        max_tokens=1200,
        tenant_id=tenant_id,
    )
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"result": {}, "confidence": 0.0}


async def generate(
    prompt: str,
    context: str = "",
    tenant_id: str = "",
    task_type: str = "general",
) -> str:
    """
    Text generation: replies, summaries, analysis.
    Returns plain string.
    """
    messages = []
    if context:
        messages.append({"role": "system", "content": context})
    messages.append({"role": "user", "content": prompt})

    content, _ = await _chat(
        messages=messages,
        task_type=task_type,
        max_tokens=1000,
        tenant_id=tenant_id or None,
    )
    return content
