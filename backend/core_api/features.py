"""GET /core/features — module feature flags for current tenant."""
from fastapi import APIRouter, Depends
from core.security import get_current_user, require_role
from core.feature_flags import get_tenant_features, is_module_enabled
import core.database as db
from core.responses import ok
from core.audit import log_action

router = APIRouter(prefix="/core/features", tags=["Features"])


@router.get("")
async def list_features(user: dict = Depends(get_current_user)):
    """Returns all module flags for the current tenant. Used by frontend ModuleContext."""
    features = await get_tenant_features(user["tenant_id"])
    tenant = await db.fetchrow("SELECT plan FROM tenants WHERE id=$1", user["tenant_id"])
    return ok({
        "modules": [{"key": k, "enabled": v} for k, v in features.items()],
        "plan": tenant["plan"] if tenant else "starter",
    })


@router.post("/check")
async def check_feature(body: dict, user: dict = Depends(get_current_user)):
    """POST {module: "invoice_agent"} -> {enabled: bool}. Used by n8n workflows."""
    module = body.get("module", "")
    enabled = await is_module_enabled(user["tenant_id"], module)
    return {"enabled": enabled, "module": module}


@router.patch("/{module}")
async def toggle_feature(
    module: str,
    body: dict,
    user: dict = Depends(require_role("admin")),
):
    """Enable or disable a module for the current tenant. Admin only."""
    enabled = bool(body.get("enabled", False))
    await db.execute(
        """INSERT INTO tenant_features (tenant_id, module, enabled, enabled_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (tenant_id, module)
           DO UPDATE SET enabled=$3, enabled_at=NOW()""",
        user["tenant_id"], module, enabled
    )
    log_action("feature.toggled", user["tenant_id"], user.get("user_id"),
               "module", module, {"enabled": enabled})
    return ok({"module": module, "enabled": enabled})
