"""
Email Agent router — /email/* endpoints.

All routes require email_agent module to be enabled for the tenant.
POST /email/ingest accepts both X-API-Key (n8n) and JWT Bearer (testing).
"""
import logging
import json
import os
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel

from core.security import get_current_user
from core.feature_flags import require_module
import core.responses as resp
import modules.email.service as service
import modules.email.queries as queries

log = logging.getLogger("docuagent")

router = APIRouter(prefix="/email", tags=["Email Agent"])
_mod = Depends(require_module("email_agent"))


# ── Pydantic schemas ──────────────────────────────────────────


class IngestPayload(BaseModel):
    message_id: Optional[str] = None
    thread_id: Optional[str] = None
    subject: str = ""
    sender: str = ""
    recipient: Optional[str] = None
    body: Optional[str] = None
    body_html: Optional[str] = None
    language: Optional[str] = "HU"


class StatusPatch(BaseModel):
    status: str


class ApprovePayload(BaseModel):
    reply_override: Optional[str] = None


# ── POST /email/ingest ────────────────────────────────────────


@router.post("/ingest")
async def ingest_email(
    payload: IngestPayload,
    user: dict = Depends(get_current_user),
    _: None = _mod,
):
    """Called by n8n WF-E1 (X-API-Key) or directly (JWT Bearer)."""
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(400, "No tenant context")

    result = await service.ingest_email(tenant_id, payload.model_dump())
    return resp.ok(result)


# ── POST /email/classify/{id} ─────────────────────────────────


@router.post("/classify/{email_id}")
async def classify_email(
    email_id: str,
    user: dict = Depends(get_current_user),
    _: None = _mod,
):
    tenant_id = user["tenant_id"]
    email = await queries.get_email(email_id, tenant_id)
    if not email:
        raise HTTPException(404, "Email not found")

    result = await service.classify_email(email_id, tenant_id)
    return resp.ok(result)


# ── POST /email/reply/{id} ────────────────────────────────────


@router.post("/reply/{email_id}")
async def generate_reply(
    email_id: str,
    user: dict = Depends(get_current_user),
    _: None = _mod,
):
    tenant_id = user["tenant_id"]
    email = await queries.get_email(email_id, tenant_id)
    if not email:
        raise HTTPException(404, "Email not found")

    try:
        result = await service.generate_reply(email_id, tenant_id)
    except RuntimeError as e:
        if "OPENAI_API_KEY is not configured" in str(e):
            log.error("Email reply generation failed: OPENAI_API_KEY is not configured")
            raise HTTPException(503, "OPENAI_API_KEY is not configured")
        raise
    return resp.ok(result)


# ── POST /email/{id}/approve ──────────────────────────────────


@router.post("/{email_id}/approve")
async def approve_email(
    email_id: str,
    payload: Optional[ApprovePayload] = None,
    user: dict = Depends(get_current_user),
    _: None = _mod,
):
    tenant_id = user["tenant_id"]
    email = await queries.get_email(email_id, tenant_id)
    if not email:
        raise HTTPException(404, "Email not found")

    reply_text = ((payload.reply_override if payload else None) or email.get("ai_response") or "").strip()
    if not reply_text:
        raise HTTPException(400, "No reply draft to approve")
    if reply_text != (email.get("ai_response") or ""):
        source_docs = email.get("source_docs") or []
        if isinstance(source_docs, str):
            try:
                source_docs = json.loads(source_docs)
            except json.JSONDecodeError:
                source_docs = []
        await queries.update_reply(email_id, reply_text, source_docs, email.get("rag_confidence"))
        email = {**email, "ai_response": reply_text}

    ok = await queries.approve_email(email_id, tenant_id, user.get("user_id") or "")
    if not ok:
        raise HTTPException(500, "Approve failed")

    # Trigger n8n WF-E2 to send the email
    webhook_url = os.getenv("N8N_EMAIL_SEND_WEBHOOK", "").strip()
    if webhook_url:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(webhook_url, json={
                    "email_id":  email_id,
                    "reply":     reply_text,
                    "recipient": email.get("recipient") or email.get("sender"),
                    "subject":   f"Re: {email.get('subject', '')}",
                })
            log.info(f"n8n WF-E2 triggered for email {email_id}")
        except Exception as e:
            log.warning(f"n8n WF-E2 webhook failed for email {email_id}: {e}")

    return resp.ok({"approved": True, "email_id": email_id})


# ── POST /email/{id}/reject ───────────────────────────────────


@router.post("/{email_id}/reject")
async def reject_email(
    email_id: str,
    user: dict = Depends(get_current_user),
    _: None = _mod,
):
    tenant_id = user["tenant_id"]
    email = await queries.get_email(email_id, tenant_id)
    if not email:
        raise HTTPException(404, "Email not found")

    ok = await queries.reject_email(email_id, tenant_id)
    return resp.ok({"rejected": ok, "email_id": email_id})


# ── PATCH /email/{id}/status ──────────────────────────────────


@router.patch("/{email_id}/status")
async def update_status(
    email_id: str,
    body: StatusPatch,
    user: dict = Depends(get_current_user),
    _: None = _mod,
):
    tenant_id = user["tenant_id"]
    email = await queries.get_email(email_id, tenant_id)
    if not email:
        raise HTTPException(404, "Email not found")

    import core.database as db
    await db.execute(
        "UPDATE email_messages SET status=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3",
        body.status, email_id, tenant_id,
    )
    return resp.ok({"email_id": email_id, "status": body.status})


# ── GET /email/list ───────────────────────────────────────────


@router.get("/list")
async def list_emails(
    status:  Optional[str] = Query(None),
    limit:   int = Query(50, ge=1, le=200),
    offset:  int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    _: None = _mod,
):
    items, total = await queries.list_emails(user["tenant_id"], status, limit, offset)
    return resp.paginated(items, total, page=offset // limit + 1, per_page=limit)


# ── GET /email/approval-queue ─────────────────────────────────


@router.get("/approval-queue")
async def approval_queue(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    _: None = _mod,
):
    items = await queries.get_approval_queue(user["tenant_id"], limit)
    return resp.ok({"items": items, "total": len(items)})


# ── GET /email/{id} ───────────────────────────────────────────


@router.get("/{email_id}")
async def get_email(
    email_id: str,
    user: dict = Depends(get_current_user),
    _: None = _mod,
):
    email = await queries.get_email(email_id, user["tenant_id"])
    if not email:
        raise HTTPException(404, "Email not found")
    return resp.ok(email)
