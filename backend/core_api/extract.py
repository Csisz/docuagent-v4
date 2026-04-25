from fastapi import APIRouter, Depends
from core.security import get_current_user

router = APIRouter(prefix="/core/extract", tags=["Extract"])


# TODO: implement — see V4 architecture spec
@router.get("")
async def not_implemented(user: dict = Depends(get_current_user)):
    return {"status": "not_implemented", "endpoint": "/core/extract"}
