"""
Compliance Layer — policy rule evaluation.

Checks the draft classification against tenant policy rules
and may veto or override the AI decision. Pure logic, no DB calls.
"""
import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("docuagent")

TAX_KEYWORDS = [
    "nav", "kata", "áfa", "szja", "adó", "bevallás",
    "adóhatóság", "iparűzési", "hipa", "társasági adó",
    "eva", "adóellenőrzés", "adóbevallás",
]

INVOICE_KEYWORDS = [
    "számla", "díjbekérő", "fizetés", "tartozás", "kiegyenlítés",
    "számlakorrekció", "stornó", "jóváírás", "számlaegyenleg",
    "fizetési felszólítás", "invoice", "payment", "bill",
]

TAX_ADVICE_TRIGGERS = [
    "kata", "szja bevallás", "áfa visszaigénylés", "társasági adó",
    "adóoptimalizálás", "adókedvezmény", "adómentesség",
]

HU_LEGAL_DISCLAIMER = (
    "\n\n---\n"
    "⚠️ Jogi és adózási tájékoztató: Ez a válasz általános tájékoztatásul szolgál és "
    "nem minősül végleges adótanácsadásnak. Konkrét adózási kérdésekben kérjük, "
    "konzultáljon könyvelőjével vagy adótanácsadójával."
)


def should_add_disclaimer(domain_tag: str, full_text: str, policy: dict) -> bool:
    if not policy.get("hu_legal_disclaimer_enabled", True):
        return False
    if domain_tag != "tax":
        return False
    lower = full_text.lower()
    return any(trigger in lower for trigger in TAX_ADVICE_TRIGGERS)


@dataclass
class ComplianceDecision:
    can_answer: bool
    status: str                          # "ai_answered" | "needs_attention"
    veto_reason: Optional[str] = None
    domain_tag: Optional[str] = None    # "tax" | "invoice" | None
    senior_required: bool = False
    add_disclaimer: bool = False


def _contains_keywords(text: str, keywords: list) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in keywords)


def evaluate(
    draft,              # ClassificationOutput
    intake,             # IntakeContext
    subject: str,
    body: str,
    policy: dict,
) -> ComplianceDecision:
    """
    Apply policy rules on top of the drafted classification.

    Rules (in priority order):
    1. auto_reply_enabled=False → always needs_attention
    2. Complaints never auto-reply (unless complaint_auto_reply=True)
    3. confidence < conf_threshold → needs_attention
    4. Tax domain detected → needs_attention (human review required)
    5. Appointment → needs_attention (human scheduling)
    6. All clear → respect draft decision
    """
    conf_threshold = policy.get("conf_threshold", 0.72)
    auto_reply_enabled = policy.get("auto_reply_enabled", True)
    complaint_auto_reply = policy.get("complaint_auto_reply", False)
    tax_routing = policy.get("tax_routing_enabled", True)
    invoice_routing = policy.get("invoice_routing_enabled", True)
    senior_review_categories = policy.get("senior_review_categories", [])
    if isinstance(senior_review_categories, str):
        import json as _json
        try:
            senior_review_categories = _json.loads(senior_review_categories)
        except Exception:
            senior_review_categories = []

    full_text = f"{subject} {body or ''}"

    domain_tag = None
    if tax_routing and _contains_keywords(full_text, TAX_KEYWORDS):
        domain_tag = "tax"
    elif invoice_routing and _contains_keywords(full_text, INVOICE_KEYWORDS):
        domain_tag = "invoice"

    if not auto_reply_enabled:
        return ComplianceDecision(
            can_answer=False,
            status="needs_attention",
            veto_reason="auto_reply_enabled=False (policy)",
            domain_tag=domain_tag,
        )

    if draft.category == "complaint" and not complaint_auto_reply:
        return ComplianceDecision(
            can_answer=False,
            status="needs_attention",
            veto_reason="complaint → human review required",
            domain_tag=domain_tag,
        )

    if draft.confidence < conf_threshold:
        return ComplianceDecision(
            can_answer=False,
            status="needs_attention",
            veto_reason=f"confidence {draft.confidence:.2f} < threshold {conf_threshold}",
            domain_tag=domain_tag,
        )

    if domain_tag == "tax":
        return ComplianceDecision(
            can_answer=False,
            status="needs_attention",
            veto_reason="tax domain detected — requires human review",
            domain_tag=domain_tag,
            add_disclaimer=should_add_disclaimer(domain_tag, full_text, policy),
        )

    if draft.category == "appointment":
        return ComplianceDecision(
            can_answer=False,
            status="needs_attention",
            veto_reason="appointment → requires human scheduling",
            domain_tag=domain_tag,
        )

    can = draft.can_answer
    senior_required = bool(
        senior_review_categories and draft.category in senior_review_categories
    )

    return ComplianceDecision(
        can_answer=can,
        status="ai_answered" if can else "needs_attention",
        domain_tag=domain_tag,
        senior_required=senior_required,
    )
