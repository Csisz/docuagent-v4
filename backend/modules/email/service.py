"""
Email Agent — business logic layer.

Implements the 5-layer pipeline: Intake → Knowledge → Drafting → Compliance → Action.
"""
import asyncio
import logging
import time
from typing import Optional

import core.database as db
from core.audit import log_action
from core.metering import increment_usage
import modules.email.queries as queries
import modules.email.agents.intake as intake_layer
import modules.email.agents.knowledge as knowledge_layer
import modules.email.agents.drafting as drafting_layer
import modules.email.agents.compliance as compliance_layer
import modules.email.agents.action as action_layer
from modules.email.agents.compliance import HU_LEGAL_DISCLAIMER

log = logging.getLogger("docuagent")

_DEFAULT_POLICY = {
    "conf_threshold":              0.72,
    "auto_reply_enabled":          True,
    "complaint_auto_reply":        False,
    "tax_routing_enabled":         True,
    "invoice_routing_enabled":     True,
    "entity_extraction_enabled":   True,
    "use_smart_model_for_reply":   True,
    "smart_model_threshold":       0.80,
    "case_autolink_enabled":       False,
    "case_autolink_urgency_min":   50,
    "hu_legal_disclaimer_enabled": True,
    "senior_review_categories":    [],
}

_LANG_INSTRUCTION = {
    "HU": (
        "Válaszolj magyarul. Legyen udvarias, empatikus és szakmai az üzenet. "
        "Szólítsd meg az ügyfelet tegező helyett magázva. "
        "Kerüld a túl formális vagy bürokratikus fogalmazást."
    ),
    "EN": (
        "Reply in English. Be polite, empathetic and professional. "
        "Use a warm but formal tone. Address the customer respectfully."
    ),
    "DE": (
        "Antworte auf Deutsch. Sei höflich, einfühlsam und professionell. "
        "Verwende die Sie-Form. Vermeide bürokratische Formulierungen."
    ),
}

_REPLY_SYSTEM = """Ügyfélszolgálati asszisztense vagy.

{lang_instruction}

Fontos szabályok:
- Légy tömör: max 3-4 bekezdés
- Kezdd köszönettel a megkeresésééért
- Válaszolj közvetlenül a feltett kérdésre
- Ha konkrét lépéseket kell tenni, sorold fel pontokba
- Fejezd be biztatással vagy következő lépés ajánlásával
- NE írj tárgyat, aláírást vagy "Üdvözlettel" sort — ezt a rendszer hozzáadja
- NE találj ki adatokat, amiről nem vagy biztos"""


async def get_email_policy(tenant_id: str) -> dict:
    """Load email policy from tenant_features.config for email_agent module."""
    policy = dict(_DEFAULT_POLICY)
    try:
        row = await db.fetchrow(
            "SELECT config FROM tenant_features WHERE tenant_id=$1 AND module='email_agent'",
            tenant_id,
        )
        if row and row["config"]:
            import json
            config = row["config"] if isinstance(row["config"], dict) else json.loads(row["config"])
            policy.update({k: v for k, v in config.items() if k in _DEFAULT_POLICY})
    except Exception as e:
        log.warning(f"get_email_policy failed for tenant {tenant_id}: {e}")
    return policy


def _auto_reply_skip_reason(email: dict, policy: dict, out, compliance) -> Optional[str]:
    if email.get("ai_response"):
        return "existing_reply"
    if not policy.get("auto_reply_enabled", True):
        return "disabled_by_policy"
    if out.confidence < policy.get("conf_threshold", 0.72):
        return "low_confidence"
    if out.category == "complaint" and not policy.get("complaint_auto_reply", False):
        return "complaint_blocked"
    if compliance.senior_required:
        return "senior_required"
    if hasattr(out, "can_answer") and not out.can_answer:
        return "cannot_answer"
    if not compliance.can_answer:
        return "cannot_answer"
    return None


async def classify_email(email_id: str, tenant_id: str) -> dict:
    """
    Full 5-layer pipeline:
    1. Load email from DB
    2. Load policy
    3. Layer 1+2: intake + knowledge in parallel
    4. Layer 3: drafting (AI classification)
    5. Layer 4: compliance (policy rules)
    6. Layer 5: action (DB persist)
    7. metering + audit
    """
    email = await queries.get_email(email_id, tenant_id)
    if not email:
        raise ValueError(f"Email {email_id} not found for tenant {tenant_id}")

    policy = await get_email_policy(tenant_id)

    # Layers 1+2: parallel
    intake_ctx, knowledge_ctx = await asyncio.gather(
        intake_layer.process(email["subject"], email.get("body") or "", policy, tenant_id),
        knowledge_layer.retrieve(email["subject"], email.get("body") or "", policy, tenant_id),
    )

    # Layer 3: drafting
    try:
        draft_result = await drafting_layer.classify(
            email["subject"],
            email.get("body") or "",
            knowledge_ctx,
            intake_ctx,
            policy,
            tenant_id,
        )
    except Exception as e:
        log.error(f"Drafting failed for email {email_id}: {e}")
        await queries.update_classification(
            email_id, "other", "needs_attention", {}, 0.0, 0, "neutral"
        )
        return {"status": "needs_attention", "error": str(e)}

    out = draft_result.output

    # Layer 4: compliance
    compliance = compliance_layer.evaluate(
        out, intake_ctx, email["subject"], email.get("body") or "", policy
    )

    # Layer 5: action (DB persist via action layer)
    action_result = await action_layer.execute(
        email_id=email_id,
        subject=email["subject"],
        sender=email.get("sender") or "",
        draft=draft_result,
        compliance=compliance,
        intake=intake_ctx,
        policy=policy,
        tenant_id=tenant_id,
    )

    asyncio.ensure_future(increment_usage(tenant_id, "email_agent", "emails_processed", 1))
    log_action(
        "email.classified",
        tenant_id=tenant_id,
        resource_type="email_message",
        resource_id=email_id,
        details={
            "status":        compliance.status,
            "category":      out.category,
            "confidence":    out.confidence,
            "urgency_score": out.urgency_score,
            "domain_tag":    compliance.domain_tag,
        },
    )

    log.info(
        f"classify_email: {email_id[:8]} → {compliance.status} "
        f"conf={out.confidence} urgency={out.urgency_score} domain={compliance.domain_tag}"
    )
    result = {
        "status":         compliance.status,
        "category":       out.category,
        "confidence":     out.confidence,
        "urgency_score":  out.urgency_score,
        "sentiment":      out.sentiment,
        "domain_tag":     compliance.domain_tag,
        "can_answer":     compliance.can_answer,
        "veto_reason":    compliance.veto_reason,
        "senior_required": compliance.senior_required,
        "booking_intent": out.booking_intent,
    }

    skip_reason = _auto_reply_skip_reason(email, policy, out, compliance)
    if skip_reason:
        log.info(f"auto_reply skipped for email {email_id}: {skip_reason}")
        result["auto_reply_skipped"] = skip_reason
        return result

    try:
        reply_result = await generate_reply(email_id, tenant_id)
        result["auto_reply_generated"] = True
        result["reply"] = reply_result.get("reply")
    except Exception as e:
        log.warning(f"auto_reply generation failed for email {email_id}: {e}")
        result["auto_reply_error"] = str(e)

    return result


async def generate_reply(email_id: str, tenant_id: str) -> dict:
    """
    Generate AI reply for an email:
    1. Load email from DB
    2. Build reply with RAG context (fallback: empty)
    3. Apply HU_LEGAL_DISCLAIMER if tax domain
    4. Persist reply
    """
    from core.ai_engine import _chat as ai_chat, MODEL_SMART, MODEL_MINI

    email = await queries.get_email(email_id, tenant_id)
    if not email:
        raise ValueError(f"Email {email_id} not found")

    policy = await get_email_policy(tenant_id)
    lang = email.get("language") or "HU"
    lang_instr = _LANG_INSTRUCTION.get(lang, _LANG_INSTRUCTION["HU"])

    # RAG context (best-effort; empty when qdrant not yet wired)
    rag_results: list = []
    rag_context = ""
    # TODO: plug in core.qdrant.search_multi() once available in v4

    sys_prompt = _REPLY_SYSTEM.format(lang_instruction=lang_instr)
    if rag_context:
        sys_prompt += f"\n\nRelevant knowledge base context:\n{rag_context}"

    use_smart = policy.get("use_smart_model_for_reply", True)
    model = MODEL_SMART if use_smart else MODEL_MINI

    t_start = time.monotonic()
    content, _ = await ai_chat(
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user",   "content": (
                f"Kategória: {email.get('category', 'inquiry')}\n"
                f"Tárgy: {email['subject']}\n\n"
                f"{(email.get('body') or '')[:3000]}"
            )},
        ],
        max_tokens=600,
        task_type="reply",
        model=model,
        tenant_id=tenant_id,
    )
    latency_ms = int((time.monotonic() - t_start) * 1000)

    # Add legal disclaimer for tax-domain emails when triggers match
    domain_tag = email.get("domain_tag") or ""
    full_text = f"{email['subject']} {email.get('body') or ''}"
    from modules.email.agents.compliance import should_add_disclaimer
    if should_add_disclaimer(domain_tag, full_text, policy):
        content += HU_LEGAL_DISCLAIMER

    source_docs = [
        {"filename": r["filename"], "score": r["score"], "collection": r.get("collection")}
        for r in rag_results
    ]
    rag_confidence = rag_results[0]["score"] if rag_results else None

    await queries.update_reply(email_id, content, source_docs, rag_confidence)
    log_action(
        "email.reply_generated",
        tenant_id=tenant_id,
        resource_type="email_message",
        resource_id=email_id,
        details={"lang": lang, "latency_ms": latency_ms, "rag_sources": len(source_docs)},
    )

    return {
        "reply":      content,
        "language":   lang,
        "sources":    source_docs,
        "latency_ms": latency_ms,
    }


async def ingest_email(tenant_id: str, payload: dict) -> dict:
    """
    Idempotent email ingestion from n8n webhook.
    Triggers classify_email in background if the email is new.
    """
    email_id, was_new = await queries.ingest_email(
        tenant_id=tenant_id,
        message_id=payload.get("message_id") or payload.get("id") or "",
        subject=payload.get("subject") or "",
        sender=payload.get("sender") or payload.get("from") or "",
        body=payload.get("body") or payload.get("text") or "",
        recipient=payload.get("recipient") or payload.get("to"),
        thread_id=payload.get("thread_id"),
        body_html=payload.get("body_html") or payload.get("html"),
    )

    if was_new and email_id:
        asyncio.ensure_future(_classify_background(email_id, tenant_id))

    email = await queries.get_email(email_id, tenant_id) if email_id else {}
    return {
        "id":      email_id,
        "was_new": was_new,
        "status":  email.get("status", "new") if email else "new",
    }


async def _classify_background(email_id: str, tenant_id: str) -> None:
    try:
        await classify_email(email_id, tenant_id)
    except Exception as e:
        log.error(f"Background classify failed for email {email_id}: {e}")
