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
