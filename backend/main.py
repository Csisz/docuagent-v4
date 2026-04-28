"""DocuAgent V4 - FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from core.config import ALLOWED_ORIGINS, COMPANY_NAME
from core.database import init_pool, close_pool
from core.limiter import limiter
import core.database as db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
log = logging.getLogger("docuagent")


async def _requeue_stuck_invoices() -> None:
    """On startup: reset invoices that got stuck during a previous process crash."""
    try:
        stuck = await db.fetch(
            """SELECT id FROM invoice_documents
               WHERE processing_status IN ('uploading', 'extracting', 'ocr_processing')
               AND updated_at < NOW() - INTERVAL '10 minutes'"""
        )
        if stuck:
            ids = [str(r["id"]) for r in stuck]
            await db.execute(
                """UPDATE invoice_documents
                   SET processing_status = 'error',
                       processing_error  = 'Server restarted during processing',
                       updated_at        = NOW()
                   WHERE id = ANY($1::uuid[])""",
                ids,
            )
            log.warning(f"Reset {len(stuck)} stuck invoice(s) on startup: {ids}")
    except Exception as e:
        log.warning(f"requeue_stuck_invoices failed (non-fatal): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(f"Starting DocuAgent V4 ({COMPANY_NAME})")
    await init_pool()
    await _requeue_stuck_invoices()
    yield
    await close_pool()
    log.info("Shutdown complete")


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


@app.get("/health", tags=["System"])
async def health():
    db_ok = db.is_connected()
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "4.0.0",
        "db": "connected" if db_ok else "disconnected",
    }


from core_api.auth     import router as auth_router
from core_api.features import router as features_router
from core_api.approve  import router as approve_router
from core_api.classify import router as classify_router
from core_api.extract  import router as extract_router
from core_api.rag      import router as rag_router
from core_api.audit    import router as audit_router
from core_api.metering import router as metering_router
from core_api.settings import router as settings_router
from core_api.admin   import router as admin_router

app.include_router(auth_router)
app.include_router(features_router)
app.include_router(approve_router)
app.include_router(classify_router)
app.include_router(extract_router)
app.include_router(rag_router)
app.include_router(audit_router)
app.include_router(metering_router)
app.include_router(settings_router)
app.include_router(admin_router)

from modules.invoice.router import router as invoice_router
app.include_router(invoice_router)

# Uncomment as modules are implemented:
# from modules.email.router    import router as email_router
# from modules.document.router import router as document_router
# app.include_router(email_router)
# app.include_router(document_router)