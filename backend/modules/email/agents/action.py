"""
Action Layer — persist classification results to DB.

v4 changes vs v3:
- Uses core.database instead of db.database
- DB table: email_messages (not emails)
- CRM case auto-link removed (crm_module not yet in v4)
"""
import logging
from dataclasses import dataclass
from typing import Optional

import core.database as db

log = logging.getLogger("docuagent")


@dataclass
class ActionResult:
    email_updated: bool = False
    # TODO: add case_id, case_linked when crm_module is built in v4


async def execute(
    email_id: Optional[str],
    subject: str,
    sender: str,
    draft,          # DraftResult
    compliance,     # ComplianceDecision
    intake,         # IntakeContext
    policy: dict,
    tenant_id: Optional[str] = None,
) -> ActionResult:
    """
    Persist classification result to email_messages table.
    CRM case auto-link is a TODO once crm_module is available.
    """
    result = ActionResult()
    if not email_id:
        return result

    out = draft.output
    try:
        import json
        ai_decision = json.dumps({
            "can_answer":    out.can_answer,
            "confidence":    out.confidence,
            "reason":        compliance.veto_reason or out.reason,
            "urgency_score": out.urgency_score,
            "sentiment":     out.sentiment,
            "booking_intent": out.booking_intent,
        })

        await db.execute(
            """UPDATE email_messages SET
                   category=$1, status=$2, ai_decision=$3::jsonb,
                   confidence=$4, urgency_score=$5, sentiment=$6,
                   domain_tag=$7, senior_required=$8, booking_intent=$9,
                   urgent=($5 >= 75), updated_at=NOW()
               WHERE id=$10""",
            out.category,
            compliance.status,
            ai_decision,
            out.confidence,
            out.urgency_score,
            out.sentiment,
            compliance.domain_tag,
            compliance.senior_required,
            out.booking_intent,
            email_id,
        )
        result.email_updated = True
    except Exception as e:
        log.error(f"Action DB update failed for email {email_id}: {e}")

    # TODO: CRM case auto-link once crm_module is built in v4

    return result
