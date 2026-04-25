# DocuAgent V4 — Core Stabilization
# Claude Code prompt — futtasd a docuagent_v4 repo gyökerében

---

You are working on **DocuAgent V4** — a clean, modular AI automation platform.
The project is at: `D:\Munka\Agentify\docuagent_v4`

Your task is to make the Core fully runnable. No module logic yet. Only the foundation.

Work through each task in order. After each file change, verify the logic is consistent with the rest of the codebase before moving on.

---

## TASK 1 — Clean up V3 leftovers from config.py

File: `backend/core/config.py`

**Remove** these variables entirely — they are module-specific, not Core:
- `N8N_LABEL_WEBHOOK`
- `N8N_CALENDAR_WEBHOOK`
- `N8N_CALENDAR_SYNC_WEBHOOK`
- `GMAIL_ACCOUNT_EMAIL`
- `GMAIL_TOKEN_EXPIRES_AT`
- `FALLBACK_REPLY_HU`, `FALLBACK_REPLY_EN`, `FALLBACK_REPLY_DE`
- `RAG_FALLBACK_THRESHOLD`
- `COLLECTION_MAP`
- `DEFAULT_COLLECTION`

**Keep** only:
```python
DB_URL
OPENAI_API_KEY
CONF_THRESHOLD
QDRANT_URL
N8N_BASE_URL
COMPANY_NAME
PORT
DASHBOARD_API_KEY
ALLOWED_ORIGINS
BASE_DIR
UPLOAD_DIR
ALLOWED_EXTS
```

Also add these missing V4 variables:
```python
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")  # already in security.py — just make it importable
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
N8N_APPROVAL_WEBHOOK = os.getenv("N8N_APPROVAL_WEBHOOK", "")  # approval engine uses this
```

---

## TASK 2 — Clean up requirements.txt

File: `backend/requirements.txt`

**Remove** (not needed yet — add back only when a module actually requires it):
- `arq`
- `redis`
- `python-magic`

**Add** these that are missing:
```
openai>=1.30.0
qdrant-client>=1.9.0
```

The final file should have exactly these sections:
```
# Core API
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
asyncpg>=0.29.0
python-dotenv>=1.0.0
pydantic>=2.7.0
pydantic[email]>=2.7.0
python-multipart>=0.0.9
httpx>=0.27.0

# Auth
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
bcrypt==4.0.1

# AI
openai>=1.30.0

# Vector DB
qdrant-client>=1.9.0

# Document parsing
pymupdf>=1.24.0
python-docx>=1.1.0
openpyxl>=3.1.0

# Rate limiting
slowapi>=0.1.9

# Utilities
numpy>=1.26.0
```

---

## TASK 3 — Fix docker-compose.yml

File: `docker-compose.yml`

**Remove** the `worker` service entirely — it depends on `arq`/`redis` which we removed.

**Remove** the `redis` service entirely.

**Remove** `redis` from all `depends_on` blocks.

**Remove** `REDIS_URL` environment variable from backend service.

Keep: `postgres`, `qdrant`, `n8n`, `backend`, `frontend`.

Also fix the frontend service — it currently has no Dockerfile path and no `postcss.config.js`. Add:
```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
  restart: unless-stopped
  ports:
    - "3000:80"
  networks:
    - docuagent
  depends_on:
    - backend
```

---

## TASK 4 — Create frontend/Dockerfile

Create file: `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## TASK 5 — Create frontend/nginx.conf (if missing)

Create file: `frontend/nginx.conf`

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /core/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## TASK 6 — Fix all import paths

**Problem:** Several files import `db.database` but the actual file is at `backend/core/database.py` in V4.

Search the entire `backend/` directory for these broken import patterns and fix them:

Replace:
```python
import db.database as _db
import db.database as db
from db.database import ...
import db.auth_queries as aq
```

With:
```python
import core.database as db
```

For `auth_queries` references in `_ref_auth.py`: these reference a V3 file that doesn't exist. Add a note but don't break it — it's a `_ref_` file, not active code.

Also check `backend/core/security.py` — it has `import db.database as _db` inside functions. Fix those too.

---

## TASK 7 — Implement core/exceptions.py (new file)

Create: `backend/core/exceptions.py`

```python
"""
Unified HTTP exceptions for DocuAgent V4.
All modules import from here — never raise raw HTTPException.
"""
from fastapi import HTTPException


class ModuleDisabledError(HTTPException):
    def __init__(self, module: str):
        super().__init__(
            status_code=403,
            detail={"error": "module_disabled", "module": module,
                    "message": f"Module '{module}' is not enabled for your plan"}
        )


class QuotaExceededError(HTTPException):
    def __init__(self, metric: str):
        super().__init__(
            status_code=429,
            detail={"error": "quota_exceeded", "metric": metric,
                    "message": f"Monthly quota for '{metric}' has been reached"}
        )


class ResourceNotFoundError(HTTPException):
    def __init__(self, resource: str, resource_id: str = ""):
        super().__init__(
            status_code=404,
            detail={"error": "not_found", "resource": resource, "id": resource_id}
        )


class AuthError(HTTPException):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(status_code=401, detail={"error": "auth_required", "message": message})


class PermissionError(HTTPException):
    def __init__(self, required_role: str = ""):
        super().__init__(
            status_code=403,
            detail={"error": "permission_denied", "required_role": required_role}
        )
```

---

## TASK 8 — Implement core/responses.py (new file)

Create: `backend/core/responses.py`

```python
"""
Unified response shapes for DocuAgent V4.
All module routers use these — ensures consistent API contract.
"""
from typing import Any, Optional


def ok(data: Any = None, message: str = "") -> dict:
    return {"success": True, "data": data, "message": message}


def paginated(items: list, total: int, page: int, per_page: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if per_page > 0 else 1,
    }


def error(code: str, message: str, details: Optional[dict] = None) -> dict:
    return {"success": False, "error": code, "message": message, "details": details or {}}
```

---

## TASK 9 — Implement core/feature_flags.py

Replace the placeholder content in: `backend/core/feature_flags.py`

```python
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
from core.security import get_current_user

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
```

---

## TASK 10 — Implement core/audit.py

Replace the placeholder content in: `backend/core/audit.py`

```python
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
```

---

## TASK 11 — Implement core/metering.py

Replace the placeholder content in: `backend/core/metering.py`

Port the logic from `backend/core/_ref_metering.py` with ONE change:
Add a `module` parameter to `increment_usage()`.

The function signature becomes:
```python
async def increment_usage(tenant_id: str, module: str, field: str, value: float = 1.0) -> None:
```

The SQL upsert stays the same but the `INSERT` includes `module`:
```sql
INSERT INTO usage_records (tenant_id, module, period_start, period_end, {col})
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (tenant_id, module, period_start) DO UPDATE
SET {col} = usage_records.{col} + EXCLUDED.{col}
```

Keep `check_quota()` exactly as in the reference, but also add:
```python
async def get_usage_summary(tenant_id: str) -> dict:
    """Returns current period usage grouped by module. Used by GET /core/meter/summary."""
    start, _ = _period()
    rows = await db.fetch(
        "SELECT module, * FROM usage_records WHERE tenant_id=$1 AND period_start=$2",
        tenant_id, start
    )
    return {row["module"]: dict(row) for row in rows}
```

---

## TASK 12 — Implement core/ai_engine.py

Replace the placeholder content in: `backend/core/ai_engine.py`

Port from `backend/core/_ref_openai_service.py`. Keep:
- `select_model()` function (good as-is)
- `_auth_headers()` function
- `_log_usage()` function — but change import to `import core.database as db`
- `embed()` function
- `chat_completion()` / `complete()` function

Add these NEW wrapper functions that modules will call:

```python
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
```

All three must:
1. Call `select_model(task_type)` to pick the right model
2. Call `_log_usage()` after the API call
3. Call `metering.increment_usage(tenant_id, "core", "ai_calls_made")` (fire and forget)

---

## TASK 13 — Implement core/rag_engine.py

Replace the placeholder content in: `backend/core/rag_engine.py`

Port from `backend/core/_ref_qdrant_service.py`. Keep:
- `ensure_collection()` function
- `_tenant_collection()` function — keep the `{tenant_id[:8]}_{domain}` naming
- `embed()` function — but use the new `ai_engine.embed()` instead of calling OpenAI directly
- `search()` function
- `ingest()` function
- `delete_by_doc_id()` function

Fix the import:
```python
# Remove:
from services.openai_service import embed
# Replace with:
from core.ai_engine import embed
```

---

## TASK 14 — Implement main.py

Replace the placeholder content in: `backend/main.py`

```python
"""
DocuAgent V4 — FastAPI application entry point.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from core.config import ALLOWED_ORIGINS, COMPANY_NAME
from core.database import init_pool, close_pool
import core.database as db

# ── Logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
log = logging.getLogger("docuagent")

# ── Rate limiter ───────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(f"Starting DocuAgent V4 ({COMPANY_NAME})")
    await init_pool()
    yield
    await close_pool()
    log.info("Shutdown complete")


# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title="DocuAgent V4",
    version="4.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    db_ok = db.is_connected()
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "4.0.0",
        "db": "connected" if db_ok else "disconnected",
    }


# ── Core API routers ──────────────────────────────────────────
from core_api.auth     import router as auth_router
from core_api.features import router as features_router
from core_api.approve  import router as approve_router
from core_api.classify import router as classify_router
from core_api.extract  import router as extract_router
from core_api.rag      import router as rag_router
from core_api.audit    import router as audit_router
from core_api.metering import router as metering_router

app.include_router(auth_router)
app.include_router(features_router)
app.include_router(approve_router)
app.include_router(classify_router)
app.include_router(extract_router)
app.include_router(rag_router)
app.include_router(audit_router)
app.include_router(metering_router)

# ── Module routers (uncomment as modules are built) ───────────
# from modules.invoice.router  import router as invoice_router
# from modules.email.router    import router as email_router
# from modules.document.router import router as document_router
# app.include_router(invoice_router)
# app.include_router(email_router)
# app.include_router(document_router)
```

---

## TASK 15 — Implement core_api/auth.py

Replace the placeholder with the full implementation.
Port directly from `backend/core_api/_ref_auth.py`.

Changes to make:
1. Change prefix from `/api/auth` to `/core/auth`
2. Change import: remove `import db.auth_queries as aq` — instead write the SQL queries inline using `import core.database as db`
3. Remove reference to `models.schemas` — use inline Pydantic models
4. Fix the tenant lookup: add `tenant_slug` field to `LoginRequest` and use it as primary lookup instead of email domain guessing

The router should implement:
- `POST /core/auth/login` → returns `{access_token, token_type, user, tenant, enabled_modules}`
  - Note: include `enabled_modules` in the login response so the frontend doesn't need a second request
- `GET /core/auth/me` → returns current user + tenant
- `POST /core/auth/users` → create user (admin only)
- `GET /core/auth/users` → list users (admin only)

For the login response, add:
```python
from core.feature_flags import get_tenant_features
enabled_modules = await get_tenant_features(str(tenant["id"]))
# Include in response: "enabled_modules": enabled_modules
```

---

## TASK 16 — Implement core_api/features.py

Replace the placeholder with full implementation.

```python
"""GET /core/features — module feature flags for current tenant."""
from fastapi import APIRouter, Depends
from core.security import get_current_user, require_role
from core.feature_flags import get_tenant_features, PLAN_DEFAULTS
import core.database as db
from core.responses import ok

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
    from core.feature_flags import is_module_enabled
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
    from core.audit import log_action
    log_action("feature.toggled", user["tenant_id"], user.get("user_id"),
               "module", module, {"enabled": enabled})
    return ok({"module": module, "enabled": enabled})
```

---

## TASK 17 — Stub the remaining core_api routers

For each of these files, replace the placeholder comment with a minimal working router stub that returns 501 Not Implemented. This allows main.py to import them without crashing.

Files:
- `backend/core_api/approve.py`
- `backend/core_api/classify.py`
- `backend/core_api/extract.py`
- `backend/core_api/rag.py`
- `backend/core_api/audit.py`
- `backend/core_api/metering.py`

Template for each:
```python
from fastapi import APIRouter, Depends
from core.security import get_current_user

router = APIRouter(prefix="/core/{name}", tags=["{Name}"])

# TODO: implement — see V4 architecture spec
@router.get("")
async def not_implemented(user: dict = Depends(get_current_user)):
    return {"status": "not_implemented", "endpoint": "/core/{name}"}
```

Use the correct prefix for each:
- approve → `/core/approve`
- classify → `/core/classify`
- extract → `/core/extract`
- rag → `/core/rag`
- audit → `/core/audit`
- metering → `/core/meter`

---

## TASK 18 — Write db/migrations/001_core_schema.sql

Replace the placeholder comment with the full SQL.
Use `backend/core/_ref_schemas.py` and `backend/db/_v3_schema_reference.sql` as reference.

The migration must create these tables in this order:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. tenants
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'starter',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. users
CREATE TABLE IF NOT EXISTS users (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email            TEXT NOT NULL,
    hashed_password  TEXT NOT NULL,
    full_name        TEXT,
    role             TEXT NOT NULL DEFAULT 'agent',
    -- role values: admin | agent | viewer | senior_approver
    is_active        BOOLEAN DEFAULT TRUE,
    last_login       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- 3. tenant_api_keys
CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash    TEXT UNIQUE NOT NULL,
    key_prefix  TEXT NOT NULL,
    label       TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    last_used   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. tenant_features (feature flags)
CREATE TABLE IF NOT EXISTS tenant_features (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module      TEXT NOT NULL,
    enabled     BOOLEAN DEFAULT FALSE,
    config      JSONB DEFAULT '{}',
    enabled_at  TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    UNIQUE(tenant_id, module)
);

-- 5. audit_log (append-only, never delete)
CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID,
    user_id       UUID,
    action        TEXT NOT NULL,
    resource_type TEXT,
    resource_id   TEXT,
    details       JSONB DEFAULT '{}',
    ip_address    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 6. approval_requests
CREATE TABLE IF NOT EXISTS approval_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    resource_type   TEXT NOT NULL,
    resource_id     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    -- status: pending | approved | rejected | escalated | expired
    requested_by    TEXT,
    confidence      FLOAT,
    data            JSONB DEFAULT '{}',
    requires_senior BOOLEAN DEFAULT FALSE,
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    note            TEXT,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 7. usage_records
CREATE TABLE IF NOT EXISTS usage_records (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    module              TEXT NOT NULL DEFAULT 'core',
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    emails_processed    INT DEFAULT 0,
    ai_calls_made       INT DEFAULT 0,
    tokens_consumed     BIGINT DEFAULT 0,
    cost_usd            FLOAT DEFAULT 0,
    documents_stored    INT DEFAULT 0,
    rag_queries         INT DEFAULT 0,
    UNIQUE(tenant_id, module, period_start)
);

-- 8. ai_usage_log
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID,
    module      TEXT,
    model       TEXT,
    task_type   TEXT,
    tokens_used INT,
    cost_usd    FLOAT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant       ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_date  ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action       ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_approval_tenant    ON approval_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_features_tenant    ON tenant_features(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_tenant       ON usage_records(tenant_id, period_start);
CREATE INDEX IF NOT EXISTS idx_ai_log_tenant      ON ai_usage_log(tenant_id, created_at DESC);
```

---

## TASK 19 — Create dev seed script

Create: `backend/seed_dev.py`

This script creates a demo tenant + admin user for local development.
Run with: `python seed_dev.py`

```python
"""
Development seed script.
Creates demo tenant + admin user if they don't exist.
Run once after first migration: python seed_dev.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from core.config import DB_URL
from core.security import hash_password
from core.database import init_pool, execute, fetchrow

DEMO_TENANT = {
    "name": "Demo Kft.",
    "slug": "demo",
    "plan": "enterprise",
}

DEMO_USER = {
    "email": "admin@demo.hu",
    "password": "admin123",
    "full_name": "Demo Admin",
    "role": "admin",
}

ALL_MODULES = [
    "email_agent", "invoice_agent", "document_agent",
    "crm_module", "calendar_module", "agent_builder",
]


async def seed():
    await init_pool()

    # Tenant
    existing = await fetchrow("SELECT id FROM tenants WHERE slug=$1", DEMO_TENANT["slug"])
    if existing:
        tenant_id = str(existing["id"])
        print(f"Tenant already exists: {tenant_id}")
    else:
        row = await fetchrow(
            "INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id",
            DEMO_TENANT["name"], DEMO_TENANT["slug"], DEMO_TENANT["plan"]
        )
        tenant_id = str(row["id"])
        print(f"Created tenant: {tenant_id}")

    # User
    existing_user = await fetchrow(
        "SELECT id FROM users WHERE email=$1 AND tenant_id=$2",
        DEMO_USER["email"], tenant_id
    )
    if existing_user:
        print(f"User already exists: {DEMO_USER['email']}")
    else:
        await execute(
            """INSERT INTO users (tenant_id, email, hashed_password, full_name, role)
               VALUES ($1, $2, $3, $4, $5)""",
            tenant_id,
            DEMO_USER["email"],
            hash_password(DEMO_USER["password"]),
            DEMO_USER["full_name"],
            DEMO_USER["role"],
        )
        print(f"Created user: {DEMO_USER['email']} / {DEMO_USER['password']}")

    # Feature flags — enable all for demo tenant
    for module in ALL_MODULES:
        await execute(
            """INSERT INTO tenant_features (tenant_id, module, enabled, enabled_at)
               VALUES ($1, $2, TRUE, NOW())
               ON CONFLICT (tenant_id, module) DO NOTHING""",
            tenant_id, module
        )
    print(f"Enabled modules: {', '.join(ALL_MODULES)}")

    print("\nSeed complete.")
    print(f"  Login: {DEMO_USER['email']}")
    print(f"  Password: {DEMO_USER['password']}")


if __name__ == "__main__":
    asyncio.run(seed())
```

---

## TASK 20 — Update .env.example

Clean up `.env.example` to match V4 (remove V3-specific variables, add V4 ones).

Remove:
- `N8N_LABEL_WEBHOOK`
- `N8N_CALENDAR_WEBHOOK`, `N8N_CALENDAR_SYNC_WEBHOOK`
- `GMAIL_ACCOUNT_EMAIL`, `GMAIL_TOKEN_EXPIRES_AT`
- `GOOGLE_SHEET_ID`, `REPORT_EMAIL`
- `FALLBACK_REPLY_HU/EN/DE`, `RAG_FALLBACK_THRESHOLD`
- `N8N_SEND_REPLY_WEBHOOK`
- `VITE_N8N_PUBLIC_URL`

Keep and reorganize into these sections:
```
# ── PostgreSQL ────────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changeme
POSTGRES_DB=docuagent
DATABASE_URL=postgresql://postgres:changeme@localhost:5432/docuagent

# ── Auth ─────────────────────────────────────────────────────
# Generate: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=
JWT_EXPIRE_MINUTES=480
DASHBOARD_API_KEY=

# ── App ──────────────────────────────────────────────────────
COMPANY_NAME=Agentify Kft.
PORT=8000
CONFIDENCE_THRESHOLD=0.70
ALLOWED_ORIGINS=http://localhost:3000
PRODUCTION=false

# ── OpenAI ───────────────────────────────────────────────────
OPENAI_API_KEY=

# ── Qdrant ───────────────────────────────────────────────────
QDRANT_URL=http://localhost:6333

# ── n8n ──────────────────────────────────────────────────────
N8N_BASE_URL=http://localhost:5678
N8N_ENCRYPTION_KEY=
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_PASSWORD=
WEBHOOK_URL=http://localhost:5678/
N8N_APPROVAL_WEBHOOK=http://localhost:5678/webhook/approval
EXECUTIONS_PROCESS=main
N8N_DEFAULT_BINARY_DATA_MODE=filesystem

# ── Frontend ─────────────────────────────────────────────────
VITE_API_URL=http://localhost:8000

# ── Notifications (optional) ─────────────────────────────────
SLACK_WEBHOOK_URL=

# ── Upload ───────────────────────────────────────────────────
MAX_UPLOAD_MB=50
```

---

## TASK 21 — Final verification

After completing all tasks, do the following checks:

1. **Import scan**: Search `backend/` for any remaining `db.database`, `db.auth_queries`, `services.openai_service`, `services.qdrant_service`, `models.schemas` imports. Fix any found.

2. **Circular import check**: Verify that `core/` files do not import from `core_api/` or `modules/`. The dependency direction must be: `modules` → `core_api` → `core`.

3. **Syntax check**: Run `python -m py_compile` on every file in `backend/core/` and `backend/core_api/`. Report any syntax errors.

4. **Docker compose validate**: Run `docker compose config` and confirm it outputs valid config with no errors.

5. **Startup test**: Run `cd backend && uvicorn main:app --port 8000` and confirm:
   - No import errors on startup
   - `GET /health` returns `{"status": "ok" or "degraded", "version": "4.0.0", "db": ...}`
   - `GET /docs` loads the Swagger UI with all core endpoints listed

Report the result of each check. If something fails, fix it before moving on.

---

## WHAT NOT TO DO

- Do not implement any module-specific business logic (invoice, email, document)
- Do not implement `approval_engine.py` yet — it needs the DB schema first
- Do not implement `ocr_engine.py` yet
- Do not touch the `_ref_` files — they are read-only reference material
- Do not add Celery, arq, or any job queue
- Do not add any external service integrations (Billingo, Gmail API, etc.)
- Do not modify the frontend files in this session

---

## SUCCESS CRITERIA

The session is complete when:
- [ ] `docker compose up backend` starts without errors
- [ ] `GET /health` returns 200
- [ ] `POST /core/auth/login` with demo credentials returns a JWT token
- [ ] `GET /core/features` with that token returns the enabled modules list
- [ ] `python backend/seed_dev.py` creates the demo tenant and user
- [ ] No `import` errors in any `backend/core/` or `backend/core_api/` file
