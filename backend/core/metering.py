"""
Usage metering per tenant per billing period.

All writes are fire-and-forget (non-blocking).
Quota checks are synchronous and called before agent layers.
"""
import logging
from datetime import date, timedelta
from typing import Optional, Tuple

import core.database as db

log = logging.getLogger("docuagent")

# Plan-level default quotas (fallback if tenant_quotas row missing)
_DEFAULT_QUOTAS = {
    "starter":    {"max_emails_per_month": 500,  "max_documents": 50,  "max_ai_calls_per_month": 1000,  "max_tokens_per_month": 500_000},
    "pro":        {"max_emails_per_month": 2000, "max_documents": 200, "max_ai_calls_per_month": 5000,  "max_tokens_per_month": 2_000_000},
    "enterprise": {"max_emails_per_month": 0,    "max_documents": 0,   "max_ai_calls_per_month": 0,     "max_tokens_per_month": 0},
}

FIELD_MAP = {
    "emails_processed": "emails_processed",
    "ai_calls_made":    "ai_calls_made",
    "tokens_consumed":  "tokens_consumed",
    "cost_usd":         "cost_usd",
    "documents_stored": "documents_stored",
    "rag_queries":      "rag_queries",
}


def _period() -> Tuple[date, date]:
    """Current billing period: 1st of month → last day of month."""
    today = date.today()
    start = today.replace(day=1)
    if today.month == 12:
        end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
    return start, end


async def increment_usage(tenant_id: str, module: str, field: str, value: float = 1.0) -> None:
    """
    Upsert usage record for the current billing period.
    Fire-and-forget — caller does not await this in practice,
    but it IS async so callers can optionally await it.
    """
    if field not in FIELD_MAP:
        log.warning(f"metering: unknown field {field!r}")
        return

    col = FIELD_MAP[field]
    start, end = _period()

    try:
        await db.execute(
            f"""INSERT INTO usage_records (tenant_id, module, period_start, period_end, {col})
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (tenant_id, module, period_start) DO UPDATE
                  SET {col} = usage_records.{col} + EXCLUDED.{col}""",
            tenant_id, module, start, end, value,
        )
    except Exception as e:
        log.warning(f"metering increment failed: {e}")


async def get_usage_summary(tenant_id: str) -> dict:
    """Returns current period usage grouped by module. Used by GET /core/meter/summary."""
    start, _ = _period()
    rows = await db.fetch(
        "SELECT module, * FROM usage_records WHERE tenant_id=$1 AND period_start=$2",
        tenant_id, start
    )
    return {row["module"]: dict(row) for row in rows}


async def check_quota(tenant_id: str, resource: str) -> Tuple[bool, int]:
    """
    Check if tenant can use more of `resource`.

    resource: "emails" | "ai_calls" | "tokens"
    Returns (allowed: bool, remaining: int).
    0 remaining means at limit. -1 means unlimited (enterprise).
    """
    start, _ = _period()

    usage_row = await db.fetchrow(
        "SELECT * FROM usage_records WHERE tenant_id=$1 AND module='core' AND period_start=$2",
        tenant_id, start,
    )
    tenant = await db.fetchrow("SELECT plan FROM tenants WHERE id=$1", tenant_id)
    plan = tenant["plan"] if tenant else "starter"
    defaults = _DEFAULT_QUOTAS.get(plan, _DEFAULT_QUOTAS["starter"])

    usage: dict = {}
    if usage_row:
        usage = dict(usage_row)

    if resource == "emails":
        limit = defaults["max_emails_per_month"]
        used  = usage.get("emails_processed", 0) or 0
    elif resource == "ai_calls":
        limit = defaults["max_ai_calls_per_month"]
        used  = usage.get("ai_calls_made", 0) or 0
    elif resource == "tokens":
        limit = defaults["max_tokens_per_month"]
        used  = usage.get("tokens_consumed", 0) or 0
    else:
        return True, -1

    if limit == 0:  # unlimited (enterprise)
        return True, -1

    remaining = max(0, limit - used)
    return remaining > 0, remaining
