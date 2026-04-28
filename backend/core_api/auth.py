"""
Authentication endpoints for DocuAgent V4.
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from core.security import (
    verify_password, create_access_token, get_current_user, hash_password, require_role,
)
import core.database as db
from core.feature_flags import get_tenant_features

router = APIRouter(prefix="/core/auth", tags=["Auth"])
log = logging.getLogger("docuagent")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    tenant_slug: Optional[str] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: str = "agent"


@router.post("/login")
async def login(req: LoginRequest):
    """Login: email + password → JWT token + enabled modules."""
    # Tenant lookup: explicit slug > email domain prefix > "demo" fallback
    tenant = None
    if req.tenant_slug:
        tenant = await db.fetchrow("SELECT * FROM tenants WHERE slug=$1 AND is_active=TRUE", req.tenant_slug)

    if not tenant:
        domain = req.email.split("@")[1] if "@" in req.email else ""
        prefix = domain.split(".")[0] if domain else ""
        tenant = await db.fetchrow("SELECT * FROM tenants WHERE slug=$1 AND is_active=TRUE", domain)
        if not tenant and prefix and prefix != domain:
            tenant = await db.fetchrow("SELECT * FROM tenants WHERE slug=$1 AND is_active=TRUE", prefix)
        if not tenant:
            tenant = await db.fetchrow("SELECT * FROM tenants WHERE slug='demo' AND is_active=TRUE")

    if not tenant:
        raise HTTPException(404, "Tenant not found")

    user = await db.fetchrow(
        "SELECT * FROM users WHERE email=$1 AND tenant_id=$2",
        req.email, str(tenant["id"])
    )
    if not user:
        raise HTTPException(401, "Invalid email or password")
    if not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(401, "Invalid email or password")
    if not user["is_active"]:
        raise HTTPException(403, "Account is inactive")

    await db.execute("UPDATE users SET last_login=NOW() WHERE id=$1", str(user["id"]))

    token = create_access_token({
        "user_id":      str(user["id"]),
        "tenant_id":    str(tenant["id"]),
        "email":        user["email"],
        "role":         user["role"],
        "tenant_slug":  tenant["slug"],
        "is_superadmin": bool(user.get("is_superadmin", False)),
    })

    enabled_modules = await get_tenant_features(str(tenant["id"]))

    log.info(f"Login: {user['email']} tenant={tenant['slug']}")
    return {
        "access_token": token,
        "token_type":   "bearer",
        "user": {
            "id":           str(user["id"]),
            "tenant_id":    str(tenant["id"]),
            "email":        user["email"],
            "full_name":    user["full_name"],
            "role":         user["role"],
            "is_active":    user["is_active"],
            "is_superadmin": bool(user.get("is_superadmin", False)),
        },
        "tenant": {
            "id":         str(tenant["id"]),
            "name":       tenant["name"],
            "slug":       tenant["slug"],
            "plan":       tenant["plan"],
            "is_active":  tenant["is_active"],
            "created_at": tenant["created_at"].isoformat(),
        },
        "enabled_modules": enabled_modules,
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Returns current user + tenant data."""
    user = await db.fetchrow("SELECT * FROM users WHERE id=$1", current_user["user_id"])
    if not user:
        raise HTTPException(404, "User not found")
    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", current_user["tenant_id"])
    return {
        "user":   {k: (str(v) if hasattr(v, 'hex') else v) for k, v in dict(user).items() if k != "hashed_password"},
        "tenant": {k: (str(v) if hasattr(v, 'hex') else v) for k, v in dict(tenant).items()},
    }


@router.post("/users")
async def create_user(
    req: UserCreate,
    current_user: dict = Depends(require_role("admin")),
):
    """Create a new user in the current tenant (admin only)."""
    existing = await db.fetchrow(
        "SELECT id FROM users WHERE email=$1 AND tenant_id=$2",
        req.email, current_user["tenant_id"]
    )
    if existing:
        raise HTTPException(409, "Email already registered")

    row = await db.fetchrow(
        """INSERT INTO users (tenant_id, email, hashed_password, full_name, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, tenant_id, email, full_name, role, is_active, created_at""",
        current_user["tenant_id"],
        req.email,
        hash_password(req.password),
        req.full_name,
        req.role,
    )
    log.info(f"User created: {req.email} role={req.role} tenant={current_user['tenant_id']}")
    return {k: (str(v) if hasattr(v, 'hex') else v) for k, v in dict(row).items()}


@router.get("/users")
async def list_users(current_user: dict = Depends(require_role("admin", "viewer"))):
    """List all users in the current tenant (admin/viewer only)."""
    rows = await db.fetch(
        "SELECT id, tenant_id, email, full_name, role, is_active, last_login, created_at "
        "FROM users WHERE tenant_id=$1 ORDER BY created_at",
        current_user["tenant_id"]
    )
    users = [{k: (str(v) if hasattr(v, 'hex') else v) for k, v in dict(r).items()} for r in rows]
    return {"users": users}
