"""
Admin API — DocuAgent V4

Two access levels:
  - tenant admin (role=admin):      manage own tenant only
  - superadmin (is_superadmin=True): manage ALL tenants

Endpoints:
  GET    /admin/tenants                   — list all tenants (superadmin)
  GET    /admin/tenants/{id}              — tenant detail (superadmin)
  PATCH  /admin/tenants/{id}             — update plan / is_active (superadmin)
  POST   /admin/tenants/{id}/modules     — bulk set modules (superadmin)
  GET    /admin/tenants/{id}/users       — list tenant users (superadmin OR own tenant admin)
  POST   /admin/tenants/{id}/users       — create user (superadmin OR own tenant admin)
  PATCH  /admin/tenants/{id}/users/{uid} — update user role/active (superadmin OR own tenant admin)
  DELETE /admin/tenants/{id}/users/{uid} — deactivate user (superadmin OR own tenant admin)
  GET    /admin/audit                     — audit log (own tenant; superadmin can filter by tenant)
  GET    /admin/usage                     — usage summary (own tenant; superadmin can filter)
  GET    /admin/stats                     — superadmin platform stats
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from core.security import get_current_user, hash_password
from core.feature_flags import PLAN_DEFAULTS
from core.audit import log_action
import core.database as db

log = logging.getLogger("docuagent")
router = APIRouter(prefix="/admin", tags=["Admin"])

VALID_PLANS = list(PLAN_DEFAULTS.keys())
VALID_ROLES = ["admin", "agent", "viewer", "senior_approver"]


# ── Auth helpers ─────────────────────────────────────────────────

async def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require role=admin OR is_superadmin."""
    if user.get("role") == "admin" or user.get("is_superadmin"):
        return user
    raise HTTPException(403, "Admin role required")


async def _require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    """Require is_superadmin=True."""
    if user.get("is_superadmin"):
        return user
    raise HTTPException(403, "Superadmin access required")


def _tenant_or_superadmin(target_tenant_id: str, user: dict):
    """
    Raise 403 unless user is superadmin OR belongs to target tenant AND is admin.
    Call this inside any endpoint that accepts a tenant_id path param.
    """
    if user.get("is_superadmin"):
        return
    if user.get("role") == "admin" and user.get("tenant_id") == target_tenant_id:
        return
    raise HTTPException(403, "Access denied")


def _serialize(row) -> dict:
    return {k: (str(v) if hasattr(v, "hex") else v) for k, v in dict(row).items()}


# ── Pydantic schemas ─────────────────────────────────────────────

class TenantUpdateRequest(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    is_active: Optional[bool] = None


class ModuleBulkRequest(BaseModel):
    modules: dict[str, bool]          # {"invoice_agent": True, "email_agent": False, ...}


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: str = "agent"
    is_superadmin: bool = False


class UserUpdateRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None
    is_superadmin: Optional[bool] = None


# ── Tenant endpoints (superadmin) ────────────────────────────────

@router.get("/tenants")
async def list_tenants(
    user: dict = Depends(_require_superadmin),
    search: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
):
    """List all tenants with module counts and usage summary."""
    conditions = ["1=1"]
    params = []
    i = 1
    if search:
        conditions.append(f"(name ILIKE ${i} OR slug ILIKE ${i})")
        params.append(f"%{search}%")
        i += 1
    if plan:
        conditions.append(f"plan = ${i}")
        params.append(plan)
        i += 1

    where = " AND ".join(conditions)
    tenants = await db.fetch(
        f"""SELECT t.*,
               (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.is_active) AS user_count,
               (SELECT COUNT(*) FROM tenant_features tf WHERE tf.tenant_id = t.id AND tf.enabled) AS enabled_modules
            FROM tenants t
            WHERE {where}
            ORDER BY t.created_at DESC""",
        *params
    )
    return {"tenants": [_serialize(r) for r in tenants]}


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: str,
    user: dict = Depends(_require_superadmin),
):
    """Full tenant detail: info + modules + quota."""
    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    features = await db.fetch(
        "SELECT module, enabled, config FROM tenant_features WHERE tenant_id=$1",
        tenant_id
    )
    modules = {r["module"]: {"enabled": r["enabled"], "config": r["config"]} for r in features}

    user_count = await db.fetchrow(
        "SELECT COUNT(*) AS cnt FROM users WHERE tenant_id=$1 AND is_active", tenant_id
    )

    return {
        "tenant": _serialize(tenant),
        "modules": modules,
        "user_count": user_count["cnt"],
    }


@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    body: TenantUpdateRequest,
    user: dict = Depends(_require_superadmin),
):
    """Update tenant plan or active status."""
    tenant = await db.fetchrow("SELECT id FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    if body.plan and body.plan not in VALID_PLANS:
        raise HTTPException(400, f"Invalid plan. Valid: {VALID_PLANS}")

    updates = []
    params = []
    i = 1
    if body.name is not None:
        updates.append(f"name=${i}"); params.append(body.name); i += 1
    if body.plan is not None:
        updates.append(f"plan=${i}"); params.append(body.plan); i += 1
    if body.is_active is not None:
        updates.append(f"is_active=${i}"); params.append(body.is_active); i += 1

    if not updates:
        raise HTTPException(400, "Nothing to update")

    updates.append(f"updated_at=NOW()")
    params.append(tenant_id)
    await db.execute(
        f"UPDATE tenants SET {', '.join(updates)} WHERE id=${i}",
        *params
    )
    log_action("admin.tenant.updated", user.get("tenant_id"), user.get("user_id"),
               "tenant", tenant_id, body.model_dump(exclude_none=True))
    return {"ok": True, "tenant_id": tenant_id}


@router.post("/tenants/{tenant_id}/modules")
async def set_tenant_modules(
    tenant_id: str,
    body: ModuleBulkRequest,
    user: dict = Depends(_require_superadmin),
):
    """
    Bulk set module flags for a tenant.
    {"invoice_agent": True, "email_agent": False}
    """
    tenant = await db.fetchrow("SELECT id FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    for module, enabled in body.modules.items():
        await db.execute(
            """INSERT INTO tenant_features (tenant_id, module, enabled, enabled_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (tenant_id, module)
               DO UPDATE SET enabled=$3, enabled_at=NOW()""",
            tenant_id, module, enabled
        )

    log_action("admin.modules.updated", user.get("tenant_id"), user.get("user_id"),
               "tenant", tenant_id, {"modules": body.modules})
    return {"ok": True, "updated": body.modules}


# ── User endpoints (admin or superadmin) ─────────────────────────

@router.get("/tenants/{tenant_id}/users")
async def list_tenant_users(
    tenant_id: str,
    user: dict = Depends(_require_admin),
):
    _tenant_or_superadmin(tenant_id, user)
    rows = await db.fetch(
        """SELECT id, tenant_id, email, full_name, role, is_active,
                  is_superadmin, last_login, created_at
           FROM users WHERE tenant_id=$1 ORDER BY created_at""",
        tenant_id
    )
    return {"users": [_serialize(r) for r in rows]}


@router.post("/tenants/{tenant_id}/users")
async def create_tenant_user(
    tenant_id: str,
    body: UserCreateRequest,
    user: dict = Depends(_require_admin),
):
    _tenant_or_superadmin(tenant_id, user)

    # Only superadmin can grant superadmin
    if body.is_superadmin and not user.get("is_superadmin"):
        raise HTTPException(403, "Only superadmin can grant superadmin")
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"Invalid role. Valid: {VALID_ROLES}")

    existing = await db.fetchrow(
        "SELECT id FROM users WHERE email=$1 AND tenant_id=$2", body.email, tenant_id
    )
    if existing:
        raise HTTPException(409, "Email already registered in this tenant")

    row = await db.fetchrow(
        """INSERT INTO users (tenant_id, email, hashed_password, full_name, role, is_superadmin)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, tenant_id, email, full_name, role, is_active, is_superadmin, created_at""",
        tenant_id, body.email, hash_password(body.password),
        body.full_name, body.role, body.is_superadmin
    )
    log_action("admin.user.created", user.get("tenant_id"), user.get("user_id"),
               "user", str(row["id"]), {"email": body.email, "role": body.role})
    return _serialize(row)


@router.patch("/tenants/{tenant_id}/users/{user_id}")
async def update_tenant_user(
    tenant_id: str,
    user_id: str,
    body: UserUpdateRequest,
    user: dict = Depends(_require_admin),
):
    _tenant_or_superadmin(tenant_id, user)

    if body.is_superadmin is not None and not user.get("is_superadmin"):
        raise HTTPException(403, "Only superadmin can change superadmin flag")
    if body.role and body.role not in VALID_ROLES:
        raise HTTPException(400, f"Invalid role. Valid: {VALID_ROLES}")

    target = await db.fetchrow(
        "SELECT id FROM users WHERE id=$1 AND tenant_id=$2", user_id, tenant_id
    )
    if not target:
        raise HTTPException(404, "User not found")

    updates = []
    params = []
    i = 1
    if body.role is not None:
        updates.append(f"role=${i}"); params.append(body.role); i += 1
    if body.is_active is not None:
        updates.append(f"is_active=${i}"); params.append(body.is_active); i += 1
    if body.full_name is not None:
        updates.append(f"full_name=${i}"); params.append(body.full_name); i += 1
    if body.is_superadmin is not None:
        updates.append(f"is_superadmin=${i}"); params.append(body.is_superadmin); i += 1

    if not updates:
        raise HTTPException(400, "Nothing to update")

    params.extend([user_id, tenant_id])
    await db.execute(
        f"UPDATE users SET {', '.join(updates)} WHERE id=${i} AND tenant_id=${i+1}",
        *params
    )
    log_action("admin.user.updated", user.get("tenant_id"), user.get("user_id"),
               "user", user_id, body.model_dump(exclude_none=True))
    return {"ok": True, "user_id": user_id}


@router.delete("/tenants/{tenant_id}/users/{user_id}")
async def deactivate_user(
    tenant_id: str,
    user_id: str,
    user: dict = Depends(_require_admin),
):
    """Soft-delete: sets is_active=False. Never hard deletes (audit trail)."""
    _tenant_or_superadmin(tenant_id, user)

    if user_id == user.get("user_id"):
        raise HTTPException(400, "Cannot deactivate yourself")

    result = await db.fetchrow(
        "UPDATE users SET is_active=FALSE WHERE id=$1 AND tenant_id=$2 RETURNING id",
        user_id, tenant_id
    )
    if not result:
        raise HTTPException(404, "User not found")

    log_action("admin.user.deactivated", user.get("tenant_id"), user.get("user_id"),
               "user", user_id)
    return {"ok": True, "user_id": user_id}


# ── Audit log ────────────────────────────────────────────────────

@router.get("/audit")
async def get_audit_log(
    user: dict = Depends(_require_admin),
    tenant_id: Optional[str] = Query(None, description="Superadmin only: filter by tenant"),
    action: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    """
    Returns audit log.
    - tenant admin: always scoped to own tenant
    - superadmin: can pass ?tenant_id= to filter, or omit for all tenants
    """
    if user.get("is_superadmin"):
        filter_tenant = tenant_id  # can be None (all) or a specific UUID
    else:
        filter_tenant = user["tenant_id"]  # always own tenant

    conditions = []
    params = []
    i = 1

    if filter_tenant:
        conditions.append(f"tenant_id=${i}"); params.append(filter_tenant); i += 1
    if action:
        conditions.append(f"action ILIKE ${i}"); params.append(f"%{action}%"); i += 1

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.extend([limit, offset])

    rows = await db.fetch(
        f"""SELECT al.*, u.email AS user_email, t.name AS tenant_name
            FROM audit_log al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN tenants t ON al.tenant_id = t.id
            {where}
            ORDER BY al.created_at DESC
            LIMIT ${i} OFFSET ${i+1}""",
        *params
    )

    total_row = await db.fetchrow(
        f"SELECT COUNT(*) AS cnt FROM audit_log {where}",
        *params[:-2]  # exclude limit/offset
    )

    return {
        "audit_log": [_serialize(r) for r in rows],
        "total": total_row["cnt"],
        "limit": limit,
        "offset": offset,
    }


# ── Usage / metering ─────────────────────────────────────────────

@router.get("/usage")
async def get_usage(
    user: dict = Depends(_require_admin),
    tenant_id: Optional[str] = Query(None, description="Superadmin only"),
    months: int = Query(3, le=12),
):
    """
    Usage records for N months.
    Superadmin can query any tenant_id, or omit for platform-wide rollup.
    """
    if user.get("is_superadmin"):
        filter_tenant = tenant_id
    else:
        filter_tenant = user["tenant_id"]

    if filter_tenant:
        rows = await db.fetch(
            """SELECT module, period_start, period_end,
                      emails_processed, ai_calls_made, tokens_consumed,
                      cost_usd, documents_stored, rag_queries
               FROM usage_records
               WHERE tenant_id=$1 AND period_start >= NOW() - ($2 || ' months')::INTERVAL
               ORDER BY period_start DESC, module""",
            filter_tenant, str(months)
        )
    else:
        # Platform-wide rollup (superadmin, no tenant filter)
        rows = await db.fetch(
            """SELECT module, period_start,
                      SUM(emails_processed)   AS emails_processed,
                      SUM(ai_calls_made)      AS ai_calls_made,
                      SUM(tokens_consumed)    AS tokens_consumed,
                      SUM(cost_usd)           AS cost_usd,
                      SUM(documents_stored)   AS documents_stored,
                      SUM(rag_queries)        AS rag_queries
               FROM usage_records
               WHERE period_start >= NOW() - ($1 || ' months')::INTERVAL
               GROUP BY module, period_start
               ORDER BY period_start DESC, module""",
            str(months)
        )

    return {"usage": [_serialize(r) for r in rows]}


# ── Platform stats (superadmin only) ────────────────────────────

@router.get("/stats")
async def get_platform_stats(user: dict = Depends(_require_superadmin)):
    """High-level platform stats for superadmin dashboard."""
    tenants    = await db.fetchrow("SELECT COUNT(*) AS cnt FROM tenants WHERE is_active")
    users_all  = await db.fetchrow("SELECT COUNT(*) AS cnt FROM users WHERE is_active")
    by_plan    = await db.fetch("SELECT plan, COUNT(*) AS cnt FROM tenants GROUP BY plan ORDER BY cnt DESC")
    recent     = await db.fetch(
        "SELECT id, name, slug, plan, created_at FROM tenants ORDER BY created_at DESC LIMIT 5"
    )
    cost_month = await db.fetchrow(
        """SELECT COALESCE(SUM(cost_usd), 0) AS total
           FROM usage_records WHERE period_start = DATE_TRUNC('month', NOW())::date"""
    )
    return {
        "total_tenants": tenants["cnt"],
        "total_users":   users_all["cnt"],
        "cost_this_month_usd": float(cost_month["total"]),
        "by_plan": [{"plan": r["plan"], "count": r["cnt"]} for r in by_plan],
        "recent_tenants": [_serialize(r) for r in recent],
    }
