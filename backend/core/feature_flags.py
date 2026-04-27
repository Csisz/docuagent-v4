"""
Feature flag system for DocuAgent V4.
Controls which modules are accessible per tenant.

Enforcement happens at 3 levels:
  1. Backend: require_module() FastAPI dependency (this file)
  2. Frontend: ModuleContext.jsx checks GET /core/features
  3. n8n: first node in every workflow calls POST /core/features/check
"""
import logging
from typing import Literal
import core.database as db
from fastapi import Depends, HTTPException
from core.security import get_current_user, get_current_user_flexible

log = logging.getLogger("docuagent")

ModuleKey = Literal[
    "invoice_agent",
    "email_agent",
    "document_agent",
    "crm_module",
    "calendar_module",
    "agent_builder",
]

# Plan -> default modules mapping
# Used when creating a new tenant or when tenant_features row is missing
PLAN_DEFAULTS: dict[str, list[str]] = {
    "free":       [],
    "starter":    ["email_agent", "document_agent"],
    "pro":        ["email_agent", "document_agent", "invoice_agent", "crm_module", "calendar_module"],
    "enterprise": ["email_agent", "document_agent", "invoice_agent", "crm_module", "calendar_module", "agent_builder"],
}


async def get_tenant_features(tenant_id: str) -> dict[str, bool]:
    """
    Returns {module_key: enabled} for all known modules for this tenant.
    Falls back to plan defaults if no tenant_features rows exist.
    """
    rows = await db.fetch(
        "SELECT module, enabled FROM tenant_features WHERE tenant_id=$1",
        tenant_id
    )

    if rows:
        result = {row["module"]: row["enabled"] for row in rows}
        # Fill in any missing modules as False
        for key in PLAN_DEFAULTS["enterprise"]:
            result.setdefault(key, False)
        return result

    # No rows — fall back to tenant plan defaults
    tenant = await db.fetchrow("SELECT plan FROM tenants WHERE id=$1", tenant_id)
    plan = tenant["plan"] if tenant else "starter"
    enabled = set(PLAN_DEFAULTS.get(plan, []))
    return {key: (key in enabled) for key in PLAN_DEFAULTS["enterprise"]}


async def is_module_enabled(tenant_id: str, module: str) -> bool:
    features = await get_tenant_features(tenant_id)
    return features.get(module, False)


def require_module(module: str):
    """
    FastAPI dependency factory.
    Returns 403 ModuleDisabledError if the module is not enabled for the tenant.

    Usage:
        @router.post("/extract")
        async def extract(
            req: ExtractRequest,
            _: None = Depends(require_module("invoice_agent")),
            user: dict = Depends(get_current_user),
        ): ...
    """
    async def _dep(user: dict = Depends(get_current_user)):
        tenant_id = user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(403, "No tenant context")
        if not await is_module_enabled(tenant_id, module):
            raise HTTPException(
                status_code=403,
                detail={"error": "module_disabled", "module": module}
            )
    return _dep


def require_module_flexible(module: str):
    """Like require_module but accepts JWT from Bearer header or ?token= query param."""
    async def _dep(user: dict = Depends(get_current_user_flexible)):
        tenant_id = user.get("tenant_id")
        if not tenant_id:
            raise HTTPException(403, "No tenant context")
        if not await is_module_enabled(tenant_id, module):
            raise HTTPException(
                status_code=403,
                detail={"error": "module_disabled", "module": module}
            )
    return _dep
