from fastapi import APIRouter, Depends
from pydantic import BaseModel
from core.security import get_current_user
import core.responses as resp

router = APIRouter(prefix="/settings", tags=["Settings"])


class BillingoTestRequest(BaseModel):
    api_key: str


@router.post("/billingo-test")
async def test_billingo_connection(
    body: BillingoTestRequest,
    user: dict = Depends(get_current_user),
):
    """Test a Billingo API key without saving it."""
    if not body.api_key.strip():
        return resp.ok({"connected": False, "error": "Hiányzó API kulcs"})
    try:
        from modules.invoice.adapters.billingo import BillingoAdapter
        adapter   = BillingoAdapter(body.api_key.strip())
        connected = await adapter.test_connection()
        return resp.ok({"connected": connected})
    except Exception as e:
        return resp.ok({"connected": False, "error": str(e)})
