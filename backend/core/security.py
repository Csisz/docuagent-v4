import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, Header, HTTPException, Query, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.security.api_key import APIKeyHeader
from jose import JWTError, jwt
from passlib.context import CryptContext
from core.config import DASHBOARD_API_KEY

log = logging.getLogger("docuagent")
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
if not SECRET_KEY:
    log.warning("JWT_SECRET_KEY not set - using insecure dev default. Set it in .env for production.")
    SECRET_KEY = "dev-insecure-secret-change-before-production"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user(
    x_api_key: Optional[str] = Header(None),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if credentials:
        try:
            return decode_token(credentials.credentials)
        except HTTPException:
            pass
    if x_api_key:
        if DASHBOARD_API_KEY and x_api_key == DASHBOARD_API_KEY:
            return {"tenant_id": None, "auth_type": "api_key", "role": "admin"}
        tenant_id = await get_tenant_from_api_key(x_api_key)
        if tenant_id:
            return {"tenant_id": tenant_id, "auth_type": "api_key", "role": "agent"}
        raise HTTPException(status_code=401, detail="Invalid API key")
    raise HTTPException(status_code=401, detail="Authentication required")


async def get_current_user_flexible(
    token_query: Optional[str] = Query(None, alias="token"),
    x_api_key: Optional[str] = Header(None),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """Accepts JWT from Authorization: Bearer header OR ?token= query param (for img src / file downloads)."""
    if credentials:
        try:
            return decode_token(credentials.credentials)
        except HTTPException:
            pass
    if token_query:
        try:
            return decode_token(token_query)
        except HTTPException:
            pass
    if x_api_key:
        if DASHBOARD_API_KEY and x_api_key == DASHBOARD_API_KEY:
            return {"tenant_id": None, "auth_type": "api_key", "role": "admin"}
        tenant_id = await get_tenant_from_api_key(x_api_key)
        if tenant_id:
            return {"tenant_id": tenant_id, "auth_type": "api_key", "role": "agent"}
        raise HTTPException(status_code=401, detail="Invalid API key")
    raise HTTPException(status_code=401, detail="Authentication required")


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Optional[dict]:
    if not credentials:
        return None
    try:
        return decode_token(credentials.credentials)
    except HTTPException:
        return None


async def require_api_key(
    x_api_key: Optional[str] = Security(_api_key_header),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    if credentials:
        try:
            decode_token(credentials.credentials)
            return
        except HTTPException:
            pass
    if x_api_key:
        if DASHBOARD_API_KEY and x_api_key == DASHBOARD_API_KEY:
            return
        if await get_tenant_from_api_key(x_api_key) is not None:
            return
        raise HTTPException(status_code=401, detail="Invalid API key")
    raise HTTPException(status_code=401, detail="Authentication required")


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def get_tenant_from_api_key(api_key: str) -> Optional[str]:
    if not api_key:
        return None
    if DASHBOARD_API_KEY and api_key == DASHBOARD_API_KEY:
        return None
    key_hash = _sha256(api_key)
    try:
        import core.database as _db
        row = await _db.fetchrow(
            "SELECT tenant_id, key_prefix FROM tenant_api_keys WHERE key_hash=$1 AND is_active=TRUE",
            key_hash,
        )
        if not row:
            return None
        await _db.execute("UPDATE tenant_api_keys SET last_used=NOW() WHERE key_hash=$1", key_hash)
        return str(row["tenant_id"])
    except Exception:
        return None


def require_role(*roles: str):
    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role", "")
        if user_role not in roles and user_role != "admin":
            raise HTTPException(status_code=403, detail=f"Required role: {roles}")
        return current_user
    return _check


async def generate_api_key(tenant_id: str, label: Optional[str] = None) -> dict:
    raw_key = "docagt_" + secrets.token_hex(32)
    key_prefix = raw_key[:15]
    key_hash = _sha256(raw_key)
    import core.database as _db
    await _db.execute(
        "INSERT INTO tenant_api_keys (tenant_id, key_hash, key_prefix, label) VALUES ($1, $2, $3, $4)",
        tenant_id, key_hash, key_prefix, label,
    )
    return {"key": raw_key, "prefix": key_prefix, "label": label}