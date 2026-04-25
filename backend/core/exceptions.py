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
