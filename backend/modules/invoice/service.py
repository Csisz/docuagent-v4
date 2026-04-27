import json
import logging
import core.database as db
import modules.invoice.queries as q
from core.ai_engine import extract
from core.audit import log_action

log = logging.getLogger("docuagent")

EXTRACTION_SCHEMA = {
    "invoice_number":  "string - invoice/document number (számlaszám), null if not found",
    "vendor_name":     "string - company issuing the invoice (kibocsátó neve)",
    "vendor_tax_id":   "string - Hungarian tax number format 12345678-1-42 (adószám)",
    "buyer_name":      "string - company receiving the invoice (vevő neve)",
    "amount_net":      "number - net amount without VAT (nettó összeg)",
    "amount_vat":      "number - VAT amount only (ÁFA összeg)",
    "amount_gross":    "number - total amount including VAT (bruttó összeg)",
    "currency":        "string - currency code, default HUF",
    "vat_rate":        "number - VAT rate as decimal: 0.27 for 27%, 0.05 for 5%, 0.0 for exempt",
    "vat_category":    "string - one of: ÁFA 27%, ÁFA 5%, ÁFA 18%, ÁFA-mentes, AAM, TAM",
    "issue_date":      "string - issue date in YYYY-MM-DD format (kiállítás dátuma)",
    "due_date":        "string - payment due date in YYYY-MM-DD format (fizetési határidő)",
    "payment_method":  "string - payment method: átutalás, készpénz, bankkártya",
    "notes":           "string - any important notes or references",
}

HUNGARIAN_INVOICE_INSTRUCTIONS = """
This is a Hungarian invoice (számla). Pay special attention to:
- Hungarian VAT rates: 27% (standard), 5% (reduced, medicines/books), 18% (some food), 0% (exempt)
- Hungarian tax number format: 12345678-1-42 (adószám)
- Date format is often DD.MM.YYYY or YYYY.MM.DD in Hungarian invoices
- Common Hungarian terms: Nettó=net, Bruttó=gross, ÁFA=VAT, Fizetési határidő=due date
- Currency is usually HUF (Ft) but may be EUR or USD
- If amounts are inconsistent, prioritize gross amount
"""

_TERMINAL_STATUSES = {"ocr_ready", "extracted", "pending_review", "verified", "exported", "rejected", "error"}


def validate_invoice_math(invoice: dict) -> list[dict]:
    """Validates VAT math consistency. Returns list of issues (empty = all good)."""
    issues = []

    net      = invoice.get("amount_net")
    vat      = invoice.get("amount_vat")
    gross    = invoice.get("amount_gross")
    vat_rate = invoice.get("vat_rate")

    if not any([net, vat, gross]):
        return issues

    TOLERANCE = 0.02  # 2 Ft kerekítési hiba

    if net and vat and gross:
        expected_gross = round(net + vat, 2)
        if abs(expected_gross - gross) > TOLERANCE:
            issues.append({
                "field":    "amount_gross",
                "severity": "error",
                "message":  f"Bruttó összeg nem egyezik: {net} + {vat} = {expected_gross}, de {gross} van megadva",
                "expected": expected_gross,
                "actual":   gross,
            })

    if net and vat_rate and vat:
        expected_vat = round(net * vat_rate, 2)
        if abs(expected_vat - vat) > max(TOLERANCE, net * 0.005):
            issues.append({
                "field":    "amount_vat",
                "severity": "error",
                "message":  f"ÁFA összeg nem stimmel: {net} × {vat_rate*100:.0f}% = {expected_vat}, de {vat} van megadva",
                "expected": expected_vat,
                "actual":   vat,
            })

    VALID_RATES = [0.0, 0.05, 0.18, 0.27]
    if vat_rate is not None and vat_rate not in VALID_RATES:
        issues.append({
            "field":    "vat_rate",
            "severity": "warning",
            "message":  f"Szokatlan ÁFA kulcs: {vat_rate*100:.1f}%. Magyar ÁFA kulcsok: 0%, 5%, 18%, 27%",
            "expected": None,
            "actual":   vat_rate,
        })

    for field, val in [("amount_net", net), ("amount_vat", vat), ("amount_gross", gross)]:
        if val is not None and val < 0:
            issues.append({
                "field":    field,
                "severity": "warning",
                "message":  f"Negatív összeg: {val}. Jóváírási számla?",
                "expected": None,
                "actual":   val,
            })

    return issues


def _parse_date(v):
    from datetime import date as _d
    if not v: return None
    try: return _d.fromisoformat(str(v)[:10])
    except: return None


# ── Pure AI extraction (no DB writes) ────────────────────────────

async def extract_invoice_fields(text: str, tenant_id: str) -> dict:
    """Returns {result: {...}, confidence: float}. No DB side effects."""
    return await extract(
        text=text,
        schema=EXTRACTION_SCHEMA,
        tenant_id=tenant_id,
        extra_instructions=HUNGARIAN_INVOICE_INSTRUCTIONS,
    )


# ── Background pipelines ──────────────────────────────────────────

async def process_invoice_background(
    invoice_id: str,
    tenant_id: str,
    file_path: str,
    filename: str,
) -> None:
    """
    Full background pipeline for uploaded files.
    Stages: preview → extract fields → word map
    Updates processing_status at each stage.
    """
    from core.ocr_engine import get_preview_image, extract_text, get_word_map

    async def set_status(status: str, error: str | None = None):
        if error:
            await db.execute(
                "UPDATE invoice_documents SET processing_status=$1, processing_error=$2, updated_at=NOW() WHERE id=$3",
                status, error[:500], invoice_id,
            )
        else:
            await db.execute(
                "UPDATE invoice_documents SET processing_status=$1, updated_at=NOW() WHERE id=$2",
                status, invoice_id,
            )

    log.info(f"=== BACKGROUND PIPELINE START: invoice={invoice_id} file={filename} ===")
    try:
        # ── Stage 1: Preview image ────────────────────────────────
        await set_status("extracting")
        log.info(f"=== Stage 1 START: preview for invoice={invoice_id} ===")
        try:
            preview_b64, _ = await get_preview_image(file_path, filename)
            if preview_b64:
                await db.execute(
                    "UPDATE invoice_documents SET preview_b64=$1, preview_ready=TRUE, updated_at=NOW() WHERE id=$2",
                    preview_b64, invoice_id,
                )
                log.info(f"=== Stage 1 DONE: preview stored ({len(preview_b64)} chars) invoice={invoice_id} ===")
            else:
                log.warning(f"=== Stage 1 WARN: preview returned None for invoice={invoice_id} ===")
        except Exception as e:
            log.warning(f"=== Stage 1 FAIL: preview non-fatal: {e} invoice={invoice_id} ===")

        # ── Stage 2: AI field extraction ─────────────────────────
        log.info(f"=== Stage 2 START: field extraction invoice={invoice_id} ===")
        text_content = await extract_text(file_path, filename)
        log.info(f"=== Stage 2 TEXT: extracted {len(text_content)} chars invoice={invoice_id} ===")
        result       = await extract_invoice_fields(text_content, tenant_id)

        extracted  = result.get("result") or {}
        confidence = float(result.get("confidence") or 0.0)
        status_val = "pending_review" if confidence < 0.75 else "extracted"

        await db.execute(
            """UPDATE invoice_documents SET
               invoice_number=$1, vendor_name=$2, vendor_tax_id=$3, buyer_name=$4,
               amount_net=$5, amount_vat=$6, amount_gross=$7, currency=$8,
               vat_rate=$9, vat_category=$10, issue_date=$11, due_date=$12,
               payment_method=$13, notes=$14,
               confidence=$15, raw_extraction=$16::jsonb,
               status=$17, processing_status='extracted', updated_at=NOW()
               WHERE id=$18""",
            extracted.get("invoice_number"),
            extracted.get("vendor_name"),
            extracted.get("vendor_tax_id"),
            extracted.get("buyer_name"),
            extracted.get("amount_net"),
            extracted.get("amount_vat"),
            extracted.get("amount_gross"),
            extracted.get("currency", "HUF"),
            extracted.get("vat_rate"),
            extracted.get("vat_category"),
            _parse_date(extracted.get("issue_date")),
            _parse_date(extracted.get("due_date")),
            extracted.get("payment_method"),
            extracted.get("notes"),
            confidence,
            json.dumps(extracted),
            status_val,
            invoice_id,
        )
        validation_issues = validate_invoice_math(extracted)
        await db.execute(
            "UPDATE invoice_documents SET validation_issues=$1::jsonb WHERE id=$2",
            json.dumps(validation_issues), invoice_id,
        )
        log.info(f"=== Stage 2 DONE: extracted confidence={confidence:.2f} status={status_val} issues={len(validation_issues)} invoice={invoice_id} ===")

        # Create approval request if needed
        if confidence < 0.75:
            try:
                await db.execute(
                    """INSERT INTO approval_requests
                       (tenant_id, resource_type, resource_id, requested_by, confidence, data, requires_senior)
                       VALUES ($1, 'invoice_extraction', $2, 'ai', $3, $4::jsonb, $5)""",
                    tenant_id, invoice_id, confidence,
                    json.dumps(extracted),
                    (extracted.get("amount_gross") or 0) > 500000,
                )
            except Exception as e:
                log.warning(f"approval_request insert failed: {e}")

        # ── Stage 3: Word map (OCR token positions) ───────────────
        await set_status("ocr_processing")
        log.info(f"=== Stage 3 START: word map invoice={invoice_id} ===")
        try:
            words = await get_word_map(file_path, filename)
            if words:
                await db.execute(
                    """UPDATE invoice_documents
                       SET word_map=$1::jsonb, ocr_ready=TRUE, processing_status='ocr_ready', updated_at=NOW()
                       WHERE id=$2""",
                    json.dumps(words), invoice_id,
                )
                log.info(f"=== Stage 3 DONE: {len(words)} words stored invoice={invoice_id} ===")
            else:
                await set_status(status_val)
                log.warning(f"=== Stage 3 WARN: word map empty, reverting to {status_val} invoice={invoice_id} ===")
        except Exception as e:
            log.error(f"=== Stage 3 FAIL: word map error invoice={invoice_id}: {e} ===", exc_info=True)
            await set_status(status_val)

        log_action(
            "invoice.processed",
            tenant_id=tenant_id,
            resource_type="invoice_document",
            resource_id=invoice_id,
            details={"confidence": confidence, "words": len(words) if words else 0},
        )

    except Exception as e:
        log.error(f"=== PIPELINE FAILED: invoice={invoice_id}: {e} ===", exc_info=True)
        await set_status("error", str(e))


async def generate_word_map(invoice_id: str, source_id: str, filename: str) -> None:
    """Re-run only the word map stage for an already-extracted invoice."""
    from core.ocr_engine import get_word_map
    log.info(f"=== REPROCESS word map START: invoice={invoice_id} file={filename} ===")
    try:
        await db.execute(
            "UPDATE invoice_documents SET processing_status='ocr_processing', processing_error=NULL, updated_at=NOW() WHERE id=$1",
            invoice_id,
        )
        words = await get_word_map(source_id, filename)
        if words:
            await db.execute(
                "UPDATE invoice_documents SET word_map=$1::jsonb, ocr_ready=TRUE, "
                "processing_status='ocr_ready', updated_at=NOW() WHERE id=$2",
                json.dumps(words), invoice_id,
            )
            log.info(f"=== REPROCESS DONE: {len(words)} words invoice={invoice_id} ===")
        else:
            await db.execute(
                "UPDATE invoice_documents SET processing_status='extracted', updated_at=NOW() WHERE id=$1",
                invoice_id,
            )
            log.warning(f"=== REPROCESS WARN: word map empty invoice={invoice_id} ===")
    except Exception as e:
        log.error(f"=== REPROCESS FAIL: invoice={invoice_id}: {e} ===", exc_info=True)
        await db.execute(
            "UPDATE invoice_documents SET processing_status='error', processing_error=$1, updated_at=NOW() WHERE id=$2",
            str(e)[:500], invoice_id,
        )


async def process_text_invoice_background(
    invoice_id: str,
    tenant_id: str,
    text: str,
) -> None:
    """
    Lighter pipeline for text-pasted invoices: extract fields only.
    No preview, no word map (no source file).
    """
    async def set_status(status: str, error: str | None = None):
        if error:
            await db.execute(
                "UPDATE invoice_documents SET processing_status=$1, processing_error=$2, updated_at=NOW() WHERE id=$3",
                status, error[:500], invoice_id,
            )
        else:
            await db.execute(
                "UPDATE invoice_documents SET processing_status=$1, updated_at=NOW() WHERE id=$2",
                status, invoice_id,
            )

    try:
        await set_status("extracting")
        result     = await extract_invoice_fields(text, tenant_id)
        extracted  = result.get("result") or {}
        confidence = float(result.get("confidence") or 0.0)
        status_val = "pending_review" if confidence < 0.75 else "extracted"

        await db.execute(
            """UPDATE invoice_documents SET
               invoice_number=$1, vendor_name=$2, vendor_tax_id=$3, buyer_name=$4,
               amount_net=$5, amount_vat=$6, amount_gross=$7, currency=$8,
               vat_rate=$9, vat_category=$10, issue_date=$11, due_date=$12,
               payment_method=$13, notes=$14,
               confidence=$15, raw_extraction=$16::jsonb,
               status=$17, processing_status=$17, updated_at=NOW()
               WHERE id=$18""",
            extracted.get("invoice_number"),
            extracted.get("vendor_name"),
            extracted.get("vendor_tax_id"),
            extracted.get("buyer_name"),
            extracted.get("amount_net"),
            extracted.get("amount_vat"),
            extracted.get("amount_gross"),
            extracted.get("currency", "HUF"),
            extracted.get("vat_rate"),
            extracted.get("vat_category"),
            _parse_date(extracted.get("issue_date")),
            _parse_date(extracted.get("due_date")),
            extracted.get("payment_method"),
            extracted.get("notes"),
            confidence,
            json.dumps(extracted),
            status_val,
            invoice_id,
        )
        validation_issues = validate_invoice_math(extracted)
        await db.execute(
            "UPDATE invoice_documents SET validation_issues=$1::jsonb WHERE id=$2",
            json.dumps(validation_issues), invoice_id,
        )
        log.info(f"Invoice {invoice_id}: text extraction done (confidence={confidence:.2f}, issues={len(validation_issues)})")

        if confidence < 0.75:
            try:
                await db.execute(
                    """INSERT INTO approval_requests
                       (tenant_id, resource_type, resource_id, requested_by, confidence, data, requires_senior)
                       VALUES ($1, 'invoice_extraction', $2, 'ai', $3, $4::jsonb, $5)""",
                    tenant_id, invoice_id, confidence,
                    json.dumps(extracted),
                    (extracted.get("amount_gross") or 0) > 500000,
                )
            except Exception as e:
                log.warning(f"approval_request insert failed: {e}")

    except Exception as e:
        log.error(f"Invoice {invoice_id} text processing failed: {e}", exc_info=True)
        await set_status("error", str(e))


# ── Synchronous extract (legacy — kept for backward compat) ──────

async def extract_invoice(
    text: str,
    tenant_id: str,
    source_type: str = "manual",
    source_id: str | None = None,
    extra_instructions: str = "",
) -> dict:
    """Synchronous extract + DB write. Still used by existing text flow."""
    result     = await extract(
        text=text,
        schema=EXTRACTION_SCHEMA,
        tenant_id=tenant_id,
        extra_instructions=HUNGARIAN_INVOICE_INSTRUCTIONS + extra_instructions,
    )
    extracted  = result.get("result") or {}
    confidence = float(result.get("confidence") or 0.0)
    needs_review = confidence < 0.75
    status = "pending_review" if needs_review else "extracted"

    invoice_data = {
        "tenant_id":      tenant_id,
        "source_type":    source_type,
        "source_id":      source_id,
        "status":         status,
        "confidence":     confidence,
        "raw_extraction": extracted,
    }
    for key in EXTRACTION_SCHEMA:
        invoice_data[key] = extracted.get(key)
    invoice_data["issue_date"] = _parse_date(invoice_data.get("issue_date"))
    invoice_data["due_date"]   = _parse_date(invoice_data.get("due_date"))

    invoice = await q.create_invoice(tenant_id, invoice_data)

    validation_issues = validate_invoice_math(extracted)
    if validation_issues:
        await db.execute(
            "UPDATE invoice_documents SET validation_issues=$1::jsonb WHERE id=$2",
            json.dumps(validation_issues), str(invoice["id"]),
        )

    if needs_review:
        try:
            await db.execute(
                """INSERT INTO approval_requests
                   (tenant_id, resource_type, resource_id, requested_by,
                    confidence, data, requires_senior)
                   VALUES ($1, 'invoice_extraction', $2, 'ai', $3, $4::jsonb, $5)""",
                tenant_id, str(invoice["id"]), confidence,
                json.dumps(extracted),
                (extracted.get("amount_gross") or 0) > 500000,
            )
        except Exception as e:
            log.warning(f"approval_request insert failed: {e}")

    log_action(
        "invoice.extracted",
        tenant_id=tenant_id,
        resource_type="invoice_document",
        resource_id=str(invoice["id"]),
        details={"confidence": confidence, "needs_review": needs_review, "vendor": extracted.get("vendor_name")},
    )
    return {**invoice, "needs_review": needs_review}


# ── Actions ───────────────────────────────────────────────────────

async def verify_invoice(invoice_id: str, tenant_id: str, user_id: str, note: str = "") -> dict:
    invoice = await q.mark_verified(invoice_id, tenant_id, user_id)
    log_action("invoice.verified", tenant_id=tenant_id, user_id=user_id,
               resource_type="invoice_document", resource_id=invoice_id,
               details={"note": note})
    return invoice


async def export_invoice(invoice_id: str, tenant_id: str, system: str) -> dict:
    from fastapi import HTTPException

    if system == "billingo":
        return await export_to_billingo(invoice_id, tenant_id)

    invoice = await q.get_invoice(invoice_id, tenant_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice["status"] != "verified":
        raise HTTPException(400, f"Invoice must be verified before export. Current status: {invoice['status']}")

    short = invoice_id[:8].upper()
    if system == "szamlazz":
        export_id, export_url = f"SZAMLAZZ-{short}", None
    else:
        export_id, export_url = f"MANUAL-{short}", None

    updated = await q.mark_exported(invoice_id, tenant_id, system, export_id, export_url)
    log_action("invoice.exported", tenant_id=tenant_id, resource_type="invoice_document",
               resource_id=invoice_id, details={"system": system, "export_id": export_id})
    return updated


async def export_to_billingo(invoice_id: str, tenant_id: str) -> dict:
    """Call Billingo API to record the verified invoice as an expense document."""
    import os
    from fastapi import HTTPException
    from modules.invoice.adapters.billingo import BillingoAdapter

    # 1 — API key check (fast fail before any DB/network calls)
    api_key = os.getenv("BILLINGO_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            400,
            "Billingo API kulcs nincs beállítva. "
            "Adja hozzá a .env fájlhoz: BILLINGO_API_KEY=<kulcs>",
        )

    # 2 — Invoice validation
    invoice = await q.get_invoice(invoice_id, tenant_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice["status"] != "verified":
        raise HTTPException(
            400,
            f"A számla Billingo exporthoz 'verified' státusz szükséges. "
            f"Jelenlegi státusz: {invoice['status']}",
        )

    adapter = BillingoAdapter(api_key)
    log.info(f"Billingo export start: invoice={invoice_id} vendor={invoice.get('vendor_name')!r}")

    # 3 — Partner lookup / create
    try:
        partner = await adapter.find_or_create_partner(
            invoice.get("vendor_name") or "Ismeretlen szállító",
            invoice.get("vendor_tax_id"),
        )
    except Exception as e:
        log.error(f"Billingo partner lookup failed for invoice {invoice_id}: {e}", exc_info=True)
        raise HTTPException(422, f"Billingo partner hiba: {e}")

    # 4 — Document creation
    try:
        doc = await adapter.create_expense_document(invoice, partner["id"])
    except Exception as e:
        log.error(f"Billingo document create failed for invoice {invoice_id}: {e}", exc_info=True)
        raise HTTPException(422, f"Billingo dokumentum létrehozása sikertelen: {e}")

    billingo_id  = str(doc.get("id", ""))
    billingo_url = doc.get("public_url") or f"https://app.billingo.hu/documents/{billingo_id}"

    await q.mark_exported(invoice_id, tenant_id, "billingo", billingo_id, billingo_url)
    log_action(
        "invoice.exported",
        tenant_id=tenant_id,
        resource_type="invoice_document",
        resource_id=invoice_id,
        details={"system": "billingo", "billingo_id": billingo_id},
    )
    log.info(f"Billingo export done: invoice={invoice_id} billingo_id={billingo_id}")
    return {
        "billingo_id":  billingo_id,
        "billingo_url": billingo_url,
        "partner_name": partner.get("name"),
        "message":      "Sikeresen exportálva Billingoba",
    }
