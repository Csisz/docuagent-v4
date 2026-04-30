import uuid
import datetime
import json
import logging
import core.database as db

log = logging.getLogger("docuagent")


def _row(rec) -> dict | None:
    if rec is None:
        return None
    d = {}
    for k, v in dict(rec).items():
        if isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, (datetime.datetime, datetime.date)):
            d[k] = v.isoformat()
        else:
            d[k] = v
    return d


async def ingest_email(
    tenant_id: str,
    message_id: str,
    subject: str,
    sender: str,
    body: str,
    recipient: str = None,
    thread_id: str = None,
    body_html: str = None,
) -> tuple[str, bool]:
    """Idempotent insert. Returns (row_id, was_new)."""
    row = await db.fetchrow(
        """INSERT INTO email_messages
               (tenant_id, message_id, thread_id, subject, sender, recipient, body, body_html)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (tenant_id, message_id) DO NOTHING
           RETURNING id""",
        tenant_id, message_id, thread_id, subject, sender, recipient, body, body_html,
    )
    if row:
        return str(row["id"]), True

    existing = await db.fetchrow(
        "SELECT id FROM email_messages WHERE tenant_id=$1 AND message_id=$2",
        tenant_id, message_id,
    )
    return str(existing["id"]) if existing else None, False


async def get_email(email_id: str, tenant_id: str) -> dict | None:
    row = await db.fetchrow(
        "SELECT * FROM email_messages WHERE id=$1 AND tenant_id=$2",
        email_id, tenant_id,
    )
    return _row(row)


async def list_emails(
    tenant_id: str,
    status: str = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list, int]:
    conds = ["tenant_id = $1"]
    args: list = [tenant_id]

    if status:
        args.append(status)
        conds.append(f"status = ${len(args)}")

    where = " AND ".join(conds)

    count_row = await db.fetchrow(
        f"SELECT COUNT(*) AS n FROM email_messages WHERE {where}", *args
    )
    total = count_row["n"] if count_row else 0

    limit_idx = len(args) + 1
    offset_idx = len(args) + 2
    args.extend([limit, offset])

    rows = await db.fetch(
        f"""SELECT * FROM email_messages
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT ${limit_idx} OFFSET ${offset_idx}""",
        *args,
    )
    return [_row(r) for r in rows], total


async def get_approval_queue(tenant_id: str, limit: int = 50) -> list:
    rows = await db.fetch(
        """SELECT * FROM email_messages
           WHERE tenant_id=$1 AND status='needs_attention'
           ORDER BY urgency_score DESC, created_at DESC
           LIMIT $2""",
        tenant_id, limit,
    )
    return [_row(r) for r in rows]


async def update_classification(
    email_id: str,
    category: str,
    status: str,
    ai_decision: dict,
    confidence: float,
    urgency_score: int,
    sentiment: str,
    domain_tag: str = None,
    senior_required: bool = False,
    booking_intent: bool = False,
) -> None:
    await db.execute(
        """UPDATE email_messages SET
               category=$1, status=$2, ai_decision=$3::jsonb,
               confidence=$4, urgency_score=$5, sentiment=$6,
               domain_tag=$7, senior_required=$8, booking_intent=$9,
               urgent=($5 >= 75), updated_at=NOW()
           WHERE id=$10""",
        category, status, json.dumps(ai_decision),
        confidence, urgency_score, sentiment,
        domain_tag, senior_required, booking_intent,
        email_id,
    )


async def update_reply(
    email_id: str,
    reply_text: str,
    source_docs: list = None,
    rag_confidence: float = None,
) -> None:
    await db.execute(
        """UPDATE email_messages SET
               ai_response=$1, source_docs=$2::jsonb, rag_confidence=$3,
               status='ai_answered', updated_at=NOW()
           WHERE id=$4""",
        reply_text,
        json.dumps(source_docs or []),
        rag_confidence,
        email_id,
    )


async def approve_email(email_id: str, tenant_id: str, approved_by_user_id: str) -> bool:
    row = await db.fetchrow(
        """UPDATE email_messages SET
               status='approved', approved_by=$3, approved_at=NOW(), updated_at=NOW()
           WHERE id=$1 AND tenant_id=$2
           RETURNING id""",
        email_id, tenant_id, approved_by_user_id,
    )
    return row is not None


async def reject_email(email_id: str, tenant_id: str) -> bool:
    row = await db.fetchrow(
        """UPDATE email_messages SET status='rejected', updated_at=NOW()
           WHERE id=$1 AND tenant_id=$2
           RETURNING id""",
        email_id, tenant_id,
    )
    return row is not None


async def mark_sent(email_id: str) -> bool:
    row = await db.fetchrow(
        """UPDATE email_messages SET status='sent', sent_at=NOW(), updated_at=NOW()
           WHERE id=$1
           RETURNING id""",
        email_id,
    )
    return row is not None
