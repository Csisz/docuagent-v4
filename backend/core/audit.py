"""
Audit logger for DocuAgent V4.

Rules:
  - Fire and forget — never blocks the caller
  - Rows are NEVER deleted (NAV compliance, 5yr retention)
  - Action format: "invoice.extracted", "email.approved", "user.login"
"""
import asyncio
import logging
from typing import Optional
import core.database as db

log = logging.getLogger("docuagent")


async def _write(
    tenant_id: Optional[str],
    user_id: Optional[str],
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> None:
    try:
        import json
        details_json = json.dumps(details or {})
        await db.execute(
            """INSERT INTO audit_log
               (tenant_id, user_id, action, resource_type, resource_id, details, ip_address)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)""",
            tenant_id, user_id, action, resource_type, resource_id, details_json, ip_address
        )
    except Exception as e:
        log.warning(f"audit.log failed (non-critical): {e}")


def log_action(
    action: str,
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> None:
    """
    Fire-and-forget audit log write.
    Call without await — schedules the write as a background task.
    """
    asyncio.ensure_future(
        _write(tenant_id, user_id, action, resource_type, resource_id, details, ip_address)
    )
