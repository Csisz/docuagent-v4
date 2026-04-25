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
