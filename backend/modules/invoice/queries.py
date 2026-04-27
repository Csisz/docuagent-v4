import uuid
import datetime
import json
import logging
import core.database as db


from datetime import date as _date

def _parse_date(val):
    """Convert string YYYY-MM-DD to datetime.date. Pass through if already date or None."""
    if val is None:
        return None
    if isinstance(val, _date):
        return val
    try:
        return _date.fromisoformat(str(val)[:10])
    except (ValueError, TypeError):
        return None
log = logging.getLogger("docuagent")

_FIELDS = [
    "invoice_number", "vendor_name", "vendor_tax_id", "buyer_name",
    "amount_net", "amount_vat", "amount_gross", "currency",
    "vat_rate", "vat_category", "issue_date", "due_date",
    "payment_method", "notes",
]


def _row(rec) -> dict | None:
    """Convert asyncpg Record → JSON-serializable dict."""
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


async def create_invoice(tenant_id: str, data: dict) -> dict:
    row = await db.fetchrow(
        """INSERT INTO invoice_documents
           (tenant_id, source_type, source_id, status,
            invoice_number, vendor_name, vendor_tax_id, buyer_name,
            amount_net, amount_vat, amount_gross, currency,
            vat_rate, vat_category, issue_date, due_date,
            payment_method, notes,
            confidence, raw_extraction, extraction_model)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21)
           RETURNING *""",
        tenant_id,
        data.get("source_type", "manual"),
        data.get("source_id"),
        data.get("status", "extracted"),
        data.get("invoice_number"),
        data.get("vendor_name"),
        data.get("vendor_tax_id"),
        data.get("buyer_name"),
        data.get("amount_net"),
        data.get("amount_vat"),
        data.get("amount_gross"),
        data.get("currency", "HUF"),
        data.get("vat_rate"),
        data.get("vat_category"),
        _parse_date(data.get("issue_date")),
        _parse_date(data.get("due_date")),
        data.get("payment_method"),
        data.get("notes"),
        data.get("confidence", 0.0),
        json.dumps(data.get("raw_extraction") or {}),
        data.get("extraction_model", "gpt-4o-mini"),
    )
    return _row(row)


async def get_invoice(invoice_id: str, tenant_id: str) -> dict | None:
    row = await db.fetchrow(
        "SELECT * FROM invoice_documents WHERE id=$1 AND tenant_id=$2",
        invoice_id, tenant_id,
    )
    return _row(row)


async def update_invoice(invoice_id: str, tenant_id: str, data: dict) -> dict:
    # Build SET clause dynamically from non-None values
    allowed = set(_FIELDS)
    updates = {k: v for k, v in data.items() if k in allowed and v is not None}
    if not updates:
        return await get_invoice(invoice_id, tenant_id)

    cols = list(updates.keys())
    vals = list(updates.values())
    set_clause = ", ".join(f"{c} = ${i+3}" for i, c in enumerate(cols))
    set_clause += ", updated_at = NOW()"

    row = await db.fetchrow(
        f"""UPDATE invoice_documents
            SET {set_clause}
            WHERE id=$1 AND tenant_id=$2
            RETURNING *""",
        invoice_id, tenant_id, *vals,
    )
    return _row(row)


async def list_invoices(
    tenant_id: str,
    filters: dict,
    page: int,
    per_page: int,
) -> tuple[list, int]:
    conds = ["tenant_id = $1"]
    args: list = [tenant_id]

    if filters.get("status"):
        args.append(filters["status"])
        conds.append(f"status = ${len(args)}")
    if filters.get("vendor_name"):
        args.append(f"%{filters['vendor_name']}%")
        conds.append(f"vendor_name ILIKE ${len(args)}")
    if filters.get("date_from"):
        args.append(_parse_date(filters["date_from"]))
        conds.append(f"issue_date >= ${len(args)}")
    if filters.get("date_to"):
        args.append(_parse_date(filters["date_to"]))
        conds.append(f"issue_date <= ${len(args)}")

    where = " AND ".join(conds)

    count_row = await db.fetchrow(
        f"SELECT COUNT(*) AS n FROM invoice_documents WHERE {where}", *args
    )
    total = count_row["n"] if count_row else 0

    limit_idx = len(args) + 1
    offset_idx = len(args) + 2
    args.extend([per_page, (page - 1) * per_page])

    rows = await db.fetch(
        f"""SELECT * FROM invoice_documents
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT ${limit_idx} OFFSET ${offset_idx}""",
        *args,
    )
    return [_row(r) for r in rows], total


async def get_invoice_stats(tenant_id: str) -> dict:
    row = await db.fetchrow(
        """SELECT
               COUNT(*)                                                   AS total,
               COUNT(*) FILTER (WHERE status = 'pending_review')          AS pending_review,
               COUNT(*) FILTER (WHERE status = 'verified')                AS verified,
               COUNT(*) FILTER (WHERE status = 'exported')                AS exported,
               COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) AS this_month,
               COALESCE(AVG(confidence), 0.0)                             AS avg_confidence,
               COUNT(*) FILTER (
                   WHERE due_date < NOW()::date
                     AND status NOT IN ('exported', 'rejected')
               ) AS overdue,
               COUNT(*) FILTER (
                   WHERE due_date BETWEEN NOW()::date AND (NOW()::date + INTERVAL '3 days')
                     AND status NOT IN ('exported', 'rejected')
               ) AS due_soon
           FROM invoice_documents
           WHERE tenant_id = $1""",
        tenant_id,
    )
    if not row:
        return {"total": 0, "pending_review": 0, "verified": 0, "exported": 0,
                "this_month": 0, "avg_confidence": 0.0, "overdue": 0, "due_soon": 0}
    return {
        "total":          int(row["total"]),
        "pending_review": int(row["pending_review"]),
        "verified":       int(row["verified"]),
        "exported":       int(row["exported"]),
        "this_month":     int(row["this_month"]),
        "avg_confidence": round(float(row["avg_confidence"]), 3),
        "overdue":        int(row["overdue"]),
        "due_soon":       int(row["due_soon"]),
    }


async def find_duplicate(
    tenant_id: str, invoice_number: str, vendor_name: str, invoice_id: str
) -> dict | None:
    """Returns existing invoice with same invoice_number + vendor_name (excluding current)."""
    if not invoice_number or not vendor_name:
        return None
    row = await db.fetchrow(
        """SELECT id, invoice_number, vendor_name, amount_gross, status, created_at
           FROM invoice_documents
           WHERE tenant_id = $1
             AND invoice_number = $2
             AND LOWER(vendor_name) = LOWER($3)
             AND id != $4
             AND status != 'rejected'
           ORDER BY created_at DESC
           LIMIT 1""",
        tenant_id, invoice_number, vendor_name, invoice_id,
    )
    return _row(row) if row else None


async def create_invoice_stub(
    tenant_id: str,
    source_type: str,
    source_id: str | None,
    filename: str | None = None,
) -> dict:
    """Create minimal invoice record for background processing."""
    row = await db.fetchrow(
        """INSERT INTO invoice_documents
           (tenant_id, source_type, source_id, filename,
            status, processing_status, currency)
           VALUES ($1, $2, $3, $4, 'uploading', 'uploading', 'HUF')
           RETURNING id, created_at, updated_at, status, processing_status,
                     source_type, source_id, filename""",
        tenant_id, source_type, source_id, filename,
    )
    return _row(row)


async def get_queue(tenant_id: str, limit: int = 50) -> list:
    """Queue view — recent invoices with processing pipeline state."""
    rows = await db.fetch(
        """SELECT id, source_type, source_id, filename,
                  processing_status, processing_error,
                  preview_ready, ocr_ready,
                  confidence, vendor_name, amount_gross, currency,
                  status, due_date,
                  export_system, export_id, export_url,
                  created_at, updated_at
           FROM invoice_documents
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT $2""",
        tenant_id, limit,
    )
    return [_row(r) for r in rows]


async def get_invoice_status(invoice_id: str, tenant_id: str) -> dict | None:
    """Lightweight status-only fetch for queue polling."""
    row = await db.fetchrow(
        """SELECT id, processing_status, processing_error,
                  preview_ready, ocr_ready,
                  status, confidence, vendor_name, amount_gross, currency
           FROM invoice_documents
           WHERE id = $1 AND tenant_id = $2""",
        invoice_id, tenant_id,
    )
    return _row(row)


async def save_word_map(invoice_id: str, tenant_id: str, words: list) -> None:
    await db.execute(
        """UPDATE invoice_documents
           SET word_map = $3::jsonb, updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2""",
        invoice_id, tenant_id, json.dumps(words),
    )


async def mark_verified(invoice_id: str, tenant_id: str, user_id: str) -> dict:
    row = await db.fetchrow(
        """UPDATE invoice_documents
           SET status='verified', verified_by=$3, verified_at=NOW(), updated_at=NOW()
           WHERE id=$1 AND tenant_id=$2
           RETURNING *""",
        invoice_id, tenant_id, user_id,
    )
    return _row(row)


async def mark_rejected(invoice_id: str, tenant_id: str, reason: str) -> dict:
    row = await db.fetchrow(
        """UPDATE invoice_documents
           SET status='rejected', rejection_reason=$3, updated_at=NOW()
           WHERE id=$1 AND tenant_id=$2
           RETURNING *""",
        invoice_id, tenant_id, reason,
    )
    return _row(row)


async def mark_exported(
    invoice_id: str,
    tenant_id: str,
    system: str,
    export_id: str | None,
    export_url: str | None,
) -> dict:
    row = await db.fetchrow(
        """UPDATE invoice_documents
           SET status='exported', export_system=$3, export_id=$4,
               export_url=$5, exported_at=NOW(), updated_at=NOW()
           WHERE id=$1 AND tenant_id=$2
           RETURNING *""",
        invoice_id, tenant_id, system, export_id, export_url,
    )
    return _row(row)
