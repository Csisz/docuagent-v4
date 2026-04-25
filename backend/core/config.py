import os
from pathlib import Path
from dotenv import load_dotenv

_root_env = Path(__file__).parent.parent.parent / ".env"
_backend_env = Path(__file__).parent.parent / ".env"
load_dotenv(_root_env if _root_env.exists() else _backend_env)

# ── Database ───────────────────────────────────────────────────
DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/docuagent")

# ── AI ────────────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
CONF_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.70"))

# ── Vector DB ─────────────────────────────────────────────────
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

# ── n8n ───────────────────────────────────────────────────────
N8N_BASE_URL         = os.getenv("N8N_BASE_URL", "http://localhost:5678")
N8N_APPROVAL_WEBHOOK = os.getenv("N8N_APPROVAL_WEBHOOK", "")

# ── App ───────────────────────────────────────────────────────
COMPANY_NAME = os.getenv("COMPANY_NAME", "Agentify Kft.")
PORT         = int(os.getenv("PORT", "8000"))

# ── Security ──────────────────────────────────────────────────
DASHBOARD_API_KEY = os.getenv("DASHBOARD_API_KEY", "")
JWT_SECRET_KEY    = os.getenv("JWT_SECRET_KEY", "")
REDIS_URL         = os.getenv("REDIS_URL", "redis://localhost:6379")

_raw_origins  = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

if _raw_origins.strip() == "*" and os.getenv("PRODUCTION", "").lower() == "true":
    import logging as _logging
    _logging.getLogger("docuagent").warning(
        "SECURITY WARNING: ALLOWED_ORIGINS is '*' in a PRODUCTION environment. "
        "Set ALLOWED_ORIGINS to your actual domain."
    )

# ── File handling ─────────────────────────────────────────────
BASE_DIR     = Path(__file__).parent.parent
UPLOAD_DIR   = BASE_DIR / "uploads"
ALLOWED_EXTS = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".txt", ".csv", ".md"}
