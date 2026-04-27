import asyncio
import logging
import uuid as _uuid
from pathlib import Path
from typing import Optional
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File
from core.security import get_current_user, get_current_user_flexible
from core.feature_flags import require_module, require_module_flexible
from core.metering import increment_usage
from core.config import UPLOAD_DIR
import core.responses as resp
import core.ocr_engine as ocr_engine
import modules.invoice.queries as q
import modules.invoice.service as svc
from modules.invoice.schemas import (
    InvoiceExtractRequest,
    InvoiceUpdateRequest,
    InvoiceVerifyRequest,
    InvoiceRejectRequest,
    InvoiceExportRequest,
    CropExtractRequest,
)

_ALLOWED_UPLOAD_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".docx"}
_MAX_UPLOAD_BYTES    = 10 * 1024 * 1024  # 10 MB

log = logging.getLogger("docuagent")

router = APIRouter(prefix="/invoice", tags=["Invoice Agent"])

_module_guard = Depends(require_module("invoice_agent"))


# ── POST /invoice/extract ─────────────────────────────────────
@router.post("/extract")
async def extract_invoice(
    background_tasks: BackgroundTasks,
    body: InvoiceExtractRequest,
    user: dict = Depends(get_current_user),
    _: None = _module_guard,
):
    tenant_id = user["tenant_id"]
    stub = await q.create_invoice_stub(tenant_id, body.source_type or "manual", body.source_id)
    background_tasks.add_task(
        svc.process_text_invoice_background, stub["id"], tenant_id, body.text
    )
    asyncio.ensure_future(increment_usage(tenant_id, "invoice_agent", "documents_stored", 1))
    return resp.ok({
        "invoice_id":        stub["id"],
        "processing_status": "uploading",
        "message":           "Feldolgozás folyamatban...",
    })


# ── GET /invoice/list ─────────────────────────────────────────
@router.get("/list")
async def list_invoices(
    status:      Optional[str]  = Query(None),
    vendor_name: Optional[str]  = Query(None),
    date_from:   Optional[date] = Query(None),
    date_to:     Optional[date] = Query(None),
    page:        int            = Query(1, ge=1),
    per_page:    int            = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    filters = {
        "status":      status,
        "vendor_name": vendor_name,
        "date_from":   date_from,
        "date_to":     date_to,
    }
    items, total = await q.list_invoices(user["tenant_id"], filters, page, per_page)
    return resp.paginated(items, total, page, per_page)


# ── GET /invoice/queue ────────────────────────────────────────
@router.get("/queue")
async def invoice_queue(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    items = await q.get_queue(user["tenant_id"], limit)
    return resp.ok({"items": items, "total": len(items)})


# ── GET /invoice/stats ────────────────────────────────────────
@router.get("/stats")
async def invoice_stats(
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    stats = await q.get_invoice_stats(user["tenant_id"])
    return resp.ok(stats)


# ── GET /invoice/export/excel ────────────────────────────────
@router.get("/export/excel")
async def export_excel(
    status:      Optional[str] = Query(None),
    date_from:   Optional[str] = Query(None),
    date_to:     Optional[str] = Query(None),
    vendor_name: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    from fastapi.responses import StreamingResponse
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter
    import io
    from collections import defaultdict

    invoices, _ = await q.list_invoices(
        user["tenant_id"],
        filters={"status": status, "date_from": date_from, "date_to": date_to, "vendor_name": vendor_name},
        page=1, per_page=10000,
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Számlák"

    header_fill = PatternFill(start_color="1a2744", end_color="1a2744", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    alt_fill    = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    COLUMNS = [
        ("Számlaszám",      "invoice_number",  20),
        ("Kibocsátó",       "vendor_name",     25),
        ("Adószám",         "vendor_tax_id",   18),
        ("Vevő",            "buyer_name",      25),
        ("Nettó (Ft)",      "amount_net",      14),
        ("ÁFA (Ft)",        "amount_vat",      14),
        ("Bruttó (Ft)",     "amount_gross",    14),
        ("Deviza",          "currency",         8),
        ("ÁFA kulcs",       "vat_rate",        10),
        ("ÁFA kategória",   "vat_category",    14),
        ("Kiállítás",       "issue_date",      14),
        ("Esedékesség",     "due_date",        14),
        ("Fizetési mód",    "payment_method",  14),
        ("Státusz",         "status",          14),
        ("Pontosság",       "confidence",      12),
        ("Export rendszer", "export_system",   16),
        ("Export ID",       "export_id",       20),
        ("Exportálva",      "exported_at",     18),
        ("Feltöltve",       "created_at",      18),
    ]

    STATUS_HU = {
        "extracted":      "Kinyerve",
        "pending_review": "Felülvizsgálat",
        "verified":       "Ellenőrizve",
        "exported":       "Exportálva",
        "rejected":       "Elutasítva",
    }

    # Headers
    for col_idx, (header, _, width) in enumerate(COLUMNS, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    ws.row_dimensions[1].height = 22

    # Data rows
    for row_idx, inv in enumerate(invoices, 2):
        for col_idx, (_, field, _) in enumerate(COLUMNS, 1):
            value = inv.get(field)
            if field in ("amount_net", "amount_vat", "amount_gross") and value is not None:
                value = float(value)
            elif field == "vat_rate" and value is not None:
                value = f"{float(value) * 100:.0f}%"
            elif field == "confidence" and value is not None:
                value = f"{float(value) * 100:.0f}%"
            elif field == "status":
                value = STATUS_HU.get(value, value)
            elif field in ("issue_date", "due_date", "exported_at", "created_at") and value:
                value = str(value)[:10]

            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            if row_idx % 2 == 0:
                cell.fill = alt_fill
            if field in ("amount_net", "amount_vat", "amount_gross"):
                cell.alignment = Alignment(horizontal="right")
                cell.number_format = "#,##0"

    # Summary row
    summary_row = len(invoices) + 2
    ws.cell(row=summary_row, column=1, value="ÖSSZESEN:").font = Font(bold=True)
    for col in [5, 6, 7]:
        col_letter = get_column_letter(col)
        c = ws.cell(row=summary_row, column=col,
                    value=f"=SUM({col_letter}2:{col_letter}{len(invoices) + 1})")
        c.font = Font(bold=True)
        c.number_format = "#,##0"

    # Sheet 2: ÁFA breakdown
    ws2 = wb.create_sheet("ÁFA összesítő")
    for col_idx, header in enumerate(
        ["ÁFA kategória", "Darabszám", "Nettó összeg", "ÁFA összeg", "Bruttó összeg"], 1
    ):
        c = ws2.cell(row=1, column=col_idx, value=header)
        c.fill = header_fill
        c.font = header_font
        ws2.column_dimensions[get_column_letter(col_idx)].width = 18

    vat_groups: dict = defaultdict(lambda: {"count": 0, "net": 0.0, "vat": 0.0, "gross": 0.0})
    for inv in invoices:
        cat = inv.get("vat_category") or "Ismeretlen"
        vat_groups[cat]["count"]  += 1
        vat_groups[cat]["net"]    += float(inv.get("amount_net")   or 0)
        vat_groups[cat]["vat"]    += float(inv.get("amount_vat")   or 0)
        vat_groups[cat]["gross"]  += float(inv.get("amount_gross") or 0)

    for i, (cat, data) in enumerate(sorted(vat_groups.items()), 2):
        ws2.cell(row=i, column=1, value=cat)
        ws2.cell(row=i, column=2, value=data["count"])
        ws2.cell(row=i, column=3, value=round(data["net"],   2))
        ws2.cell(row=i, column=4, value=round(data["vat"],   2))
        ws2.cell(row=i, column=5, value=round(data["gross"], 2))

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    period   = f"{date_from or 'kezdet'}_{date_to or 'veg'}"
    filename = f"szamlak_{period}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── GET /invoice/export/pdf-summary ──────────────────────────
@router.get("/export/pdf-summary")
async def export_pdf_summary(
    date_from:   Optional[str] = Query(None),
    date_to:     Optional[str] = Query(None),
    status:      Optional[str] = Query(None),
    vendor_name: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    from fastapi.responses import Response
    from modules.invoice.report_generator import generate_invoice_report
    import core.database as _db

    invoices, _ = await q.list_invoices(
        user["tenant_id"],
        filters={"status": status, "date_from": date_from, "date_to": date_to, "vendor_name": vendor_name},
        page=1, per_page=10000,
    )

    tenant = await _db.fetchrow("SELECT name FROM tenants WHERE id=$1", user["tenant_id"])
    company_name = tenant["name"] if tenant else "Ismeretlen cég"

    if date_from and date_to:
        period = f"{date_from} – {date_to}"
    elif date_from:
        period = f"{date_from} –"
    elif date_to:
        period = f"– {date_to}"
    else:
        period = "Teljes időszak"

    pdf_bytes = generate_invoice_report(
        invoices=invoices,
        period_label=period,
        company_name=company_name,
        generated_by=user.get("full_name") or user.get("email") or "Admin",
    )

    filename = f"szamla_osszesito_{date_from or 'osszes'}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── GET /invoice/export/csv ───────────────────────────────────
@router.get("/export/csv")
async def export_csv(
    status:      Optional[str] = Query(None),
    date_from:   Optional[str] = Query(None),
    date_to:     Optional[str] = Query(None),
    vendor_name: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    from fastapi.responses import StreamingResponse
    import csv, io

    invoices, _ = await q.list_invoices(
        user["tenant_id"],
        filters={"status": status, "date_from": date_from, "date_to": date_to, "vendor_name": vendor_name},
        page=1, per_page=10000,
    )

    output = io.StringIO()
    output.write("﻿")  # UTF-8 BOM for Excel compatibility
    writer = csv.writer(output, delimiter=";")  # semicolon for Hungarian Excel

    writer.writerow([
        "Számlaszám", "Kibocsátó", "Adószám", "Vevő",
        "Nettó", "ÁFA", "Bruttó", "Deviza",
        "ÁFA kulcs", "ÁFA kategória", "Kiállítás", "Esedékesség",
        "Fizetési mód", "Státusz", "Pontosság",
    ])
    for inv in invoices:
        writer.writerow([
            inv.get("invoice_number", ""),
            inv.get("vendor_name", ""),
            inv.get("vendor_tax_id", ""),
            inv.get("buyer_name", ""),
            inv.get("amount_net", ""),
            inv.get("amount_vat", ""),
            inv.get("amount_gross", ""),
            inv.get("currency", "HUF"),
            f"{float(inv.get('vat_rate') or 0) * 100:.0f}%" if inv.get("vat_rate") is not None else "",
            inv.get("vat_category", ""),
            str(inv.get("issue_date", ""))[:10],
            str(inv.get("due_date",   ""))[:10],
            inv.get("payment_method", ""),
            inv.get("status", ""),
            f"{float(inv.get('confidence') or 0) * 100:.0f}%" if inv.get("confidence") is not None else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=szamlak.csv"},
    )


# ── POST /invoice/upload ──────────────────────────────────────
@router.post("/upload")
async def upload_invoice(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    _: None = _module_guard,
):
    raw_filename = file.filename or ""
    try:
        raw_filename = raw_filename.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass

    ext = Path(raw_filename).suffix.lower() if raw_filename else ""
    if ext not in _ALLOWED_UPLOAD_EXTS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: pdf, jpg, jpeg, png, webp, docx")

    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large. Maximum allowed size is 10 MB")

    tenant_id = user["tenant_id"]
    dest_dir  = UPLOAD_DIR / tenant_id / "invoice"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"{_uuid.uuid4()}{ext}"
    dest_path.write_bytes(contents)

    stub = await q.create_invoice_stub(
        tenant_id, "upload", str(dest_path), raw_filename
    )
    background_tasks.add_task(
        svc.process_invoice_background,
        stub["id"], tenant_id, str(dest_path), raw_filename,
    )
    asyncio.ensure_future(increment_usage(tenant_id, "invoice_agent", "documents_stored", 1))
    return resp.ok({
        "invoice_id":        stub["id"],
        "processing_status": "uploading",
        "filename":          raw_filename,
        "message":           "Feldolgozás folyamatban...",
    })


# ── GET /invoice/word-map/{invoice_id} ───────────────────────
@router.get("/word-map/{invoice_id}")
async def get_invoice_word_map(
    invoice_id: str,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    """DB-only — never generates. Generation happens exclusively in background pipeline."""
    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    word_map = invoice.get("word_map")
    if word_map:
        words = word_map if isinstance(word_map, list) else []
        log.info(f"word-map {invoice_id}: cached ({len(words)} words)")
        return resp.ok({"words": words, "has_map": True, "word_count": len(words), "cached": True})

    log.info(f"word-map {invoice_id}: not ready yet (ocr_ready={invoice.get('ocr_ready')})")
    return resp.ok({
        "words": [], "has_map": False, "word_count": 0, "cached": False,
        "message": "OCR térkép még feldolgozás alatt — kérjük várjon",
    })


# ── GET /invoice/preview/{invoice_id} ────────────────────────
@router.get("/preview/{invoice_id}")
async def get_invoice_preview(
    invoice_id: str,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    if invoice.get("source_type") != "upload" or not invoice.get("source_id"):
        return resp.ok({"has_preview": False, "preview": None, "media_type": None})

    # DB cache hit (stored by background pipeline)
    if invoice.get("preview_b64"):
        return resp.ok({
            "has_preview": True,
            "preview":     invoice["preview_b64"],
            "media_type":  "image/png",
        })

    # Fallback: compute from disk
    file_path = invoice["source_id"]
    filename  = Path(file_path).name
    b64, media_type = await ocr_engine.get_preview_image(file_path, filename)
    return resp.ok({
        "has_preview": b64 is not None,
        "preview":     b64,
        "media_type":  media_type,
    })


# ── POST /invoice/crop-extract ────────────────────────────────
@router.post("/crop-extract")
async def crop_extract(
    body: CropExtractRequest,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    invoice = await q.get_invoice(body.invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if not invoice.get("source_id"):
        raise HTTPException(400, "This invoice has no source file for crop extraction")

    file_path = invoice["source_id"]
    filename  = Path(file_path).name
    try:
        value = await ocr_engine.extract_from_crop(
            file_path, filename, body.x, body.y, body.w, body.h, body.field_hint
        )
    except Exception as e:
        log.warning(f"crop-extract failed for {body.invoice_id}: {e}")
        raise HTTPException(422, f"Crop extraction failed: {e}")

    return resp.ok({"extracted_value": value})


# ── GET /invoice/file/{invoice_id} ───────────────────────────
@router.get("/file/{invoice_id}")
async def serve_invoice_file(
    invoice_id: str,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    """Serve the original invoice file directly via FileResponse (browser-cached)."""
    from fastapi.responses import FileResponse

    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    source_id = invoice.get("source_id")
    if not source_id:
        raise HTTPException(404, "No file associated with this invoice")

    file_path = Path(source_id)
    if not file_path.exists():
        raise HTTPException(404, f"File not found on disk")

    _MEDIA_TYPES = {
        ".pdf":  "application/pdf",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
        ".webp": "image/webp",
    }
    media_type = _MEDIA_TYPES.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
        headers={"Cache-Control": "private, max-age=3600", "X-Invoice-Id": invoice_id},
    )


# ── GET /invoice/preview-png/{invoice_id} ────────────────────
@router.get("/preview-png/{invoice_id}")
async def get_preview_png(
    invoice_id: str,
    user: dict = Depends(get_current_user_flexible),
    _: None    = Depends(require_module_flexible("invoice_agent")),
):
    """
    Return a PNG preview of the invoice as a binary HTTP response.
    First call: generates from disk, saves to DB.
    Subsequent calls: returns from DB (instant, browser-cached via ETag).
    """
    import base64
    from fastapi.responses import Response

    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    if invoice.get("preview_b64") and invoice.get("preview_ready"):
        png_bytes = base64.b64decode(invoice["preview_b64"])
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={"Cache-Control": "private, max-age=86400", "X-Cache": "HIT"},
        )

    source_id = invoice.get("source_id")
    if not source_id:
        raise HTTPException(404, "No source file")

    file_path = Path(source_id)
    if not file_path.exists():
        raise HTTPException(404, "File not found on disk")

    preview_b64, _ = await ocr_engine.get_preview_image(str(file_path), file_path.name)
    if not preview_b64:
        raise HTTPException(422, "Could not generate preview")

    import core.database as db
    await db.execute(
        "UPDATE invoice_documents SET preview_b64=$1, preview_ready=TRUE, updated_at=NOW() WHERE id=$2",
        preview_b64, invoice_id,
    )
    log.info(f"preview-png {invoice_id}: generated and cached")

    png_bytes = base64.b64decode(preview_b64)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=86400", "X-Cache": "MISS"},
    )


# ── POST /invoice/{invoice_id}/reprocess ─────────────────────
@router.post("/{invoice_id}/reprocess")
async def reprocess_invoice(
    invoice_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    _: None = _module_guard,
):
    """Reset OCR state and re-run word map generation in background."""
    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    source_id = invoice.get("source_id")
    if not source_id:
        raise HTTPException(400, "Nincs forrás fájl az újrafeldolgozáshoz")

    import core.database as _db
    await _db.execute(
        "UPDATE invoice_documents SET ocr_ready=FALSE, word_map=NULL, "
        "processing_status='extracted', processing_error=NULL, updated_at=NOW() WHERE id=$1",
        invoice_id,
    )
    filename = Path(source_id).name
    background_tasks.add_task(svc.generate_word_map, invoice_id, source_id, filename)
    log.info(f"reprocess requested for invoice {invoice_id} by tenant {user['tenant_id']}")
    return resp.ok({"message": "OCR térkép újragenerálása elindítva"})


# ── GET /invoice/{invoice_id}/status ─────────────────────────
@router.get("/{invoice_id}/status")
async def get_invoice_status(
    invoice_id: str,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    status = await q.get_invoice_status(invoice_id, user["tenant_id"])
    if not status:
        raise HTTPException(404, "Invoice not found")
    return resp.ok(status)


# ── GET /invoice/{invoice_id}/check-duplicate ────────────────
@router.get("/{invoice_id}/check-duplicate")
async def check_duplicate(
    invoice_id: str,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    duplicate = await q.find_duplicate(
        user["tenant_id"],
        invoice.get("invoice_number"),
        invoice.get("vendor_name"),
        invoice_id,
    )
    return resp.ok({
        "is_duplicate":      duplicate is not None,
        "duplicate_invoice": duplicate,
    })


# ── GET /invoice/{invoice_id} ─────────────────────────────────
@router.get("/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    return resp.ok(invoice)


# ── PUT /invoice/{invoice_id} ─────────────────────────────────
@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    body: InvoiceUpdateRequest,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    updated = await q.update_invoice(
        invoice_id, user["tenant_id"], body.model_dump(exclude_none=True)
    )
    return resp.ok(updated)


# ── POST /invoice/{invoice_id}/verify ────────────────────────
@router.post("/{invoice_id}/verify")
async def verify_invoice(
    invoice_id: str,
    body: InvoiceVerifyRequest,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice["status"] not in ("extracted", "pending_review"):
        raise HTTPException(400, f"Cannot verify invoice with status '{invoice['status']}'")

    verified = await svc.verify_invoice(invoice_id, user["tenant_id"], user["user_id"], body.note)
    return resp.ok(verified)


# ── POST /invoice/{invoice_id}/reject ────────────────────────
@router.post("/{invoice_id}/reject")
async def reject_invoice(
    invoice_id: str,
    body: InvoiceRejectRequest,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice["status"] == "exported":
        raise HTTPException(400, "Cannot reject an already exported invoice")

    rejected = await q.mark_rejected(invoice_id, user["tenant_id"], body.reason)
    return resp.ok(rejected)


# ── DELETE /invoice/{invoice_id} ─────────────────────────────
@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    invoice = await q.get_invoice(invoice_id, user["tenant_id"])
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    import core.database as _db
    await _db.execute(
        "DELETE FROM invoice_documents WHERE id=$1 AND tenant_id=$2",
        invoice_id, user["tenant_id"],
    )
    from core.audit import log_action
    log_action("invoice.deleted", tenant_id=user["tenant_id"],
               user_id=user.get("user_id"),
               resource_type="invoice_document", resource_id=invoice_id)
    return resp.ok({"message": "Számla törölve"})


# ── POST /invoice/{invoice_id}/export ────────────────────────
@router.post("/{invoice_id}/export")
async def export_invoice(
    invoice_id: str,
    body: InvoiceExportRequest,
    user: dict = Depends(get_current_user),
    _: None    = _module_guard,
):
    try:
        exported = await svc.export_invoice(invoice_id, user["tenant_id"], body.system)
        return resp.ok(exported)
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Export failed for invoice {invoice_id} system={body.system}: {e}", exc_info=True)
        raise HTTPException(422, f"Exportálás sikertelen: {str(e)}")
