"""
Monthly invoice summary PDF generator.
Uses reportlab for PDF creation.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from datetime import datetime
from collections import defaultdict
import logging
import os
import io

log = logging.getLogger("docuagent")

NAVY   = HexColor("#1a2744")
BLUE   = HexColor("#1a56db")
LIGHT  = HexColor("#f8fafc")
BORDER = HexColor("#e2e8f0")
GRAY   = HexColor("#64748b")


def _register_fonts():
    """Register DejaVu fonts from backend/fonts/ for full Unicode/Hungarian support."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from pathlib import Path

    fonts_dir = Path(__file__).parent.parent.parent / "fonts"
    regular   = fonts_dir / "DejaVuSans.ttf"
    bold      = fonts_dir / "DejaVuSans-Bold.ttf"

    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("DejaVu",      str(regular)))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(bold)))
        log.info(f"DejaVu fonts loaded from {fonts_dir}")
        return "DejaVu", "DejaVu-Bold"

    log.warning(f"DejaVu fonts NOT found at {fonts_dir}, falling back to Helvetica")
    return "Helvetica", "Helvetica-Bold"


FONT_NORMAL, FONT_BOLD = _register_fonts()


def _p(text, style):
    """Shorthand: wrap text in a Paragraph (required for TTFont Unicode rendering)."""
    return Paragraph(str(text) if text is not None else "—", style)


def generate_invoice_report(
    invoices: list,
    period_label: str,
    company_name: str,
    generated_by: str,
) -> bytes:
    """Generate a professional PDF summary of invoices. Returns PDF bytes."""
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm,  bottomMargin=2*cm,
    )

    # ── Paragraph styles ─────────────────────────────────────────
    title_style = ParagraphStyle(
        "rg_title", fontSize=20, fontName=FONT_BOLD,
        textColor=NAVY, spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "rg_subtitle", fontSize=11, fontName=FONT_NORMAL,
        textColor=GRAY, spaceAfter=20,
    )
    section_style = ParagraphStyle(
        "rg_section", fontSize=13, fontName=FONT_BOLD,
        textColor=NAVY, spaceBefore=16, spaceAfter=8,
    )
    footer_style = ParagraphStyle(
        "rg_footer", fontSize=7, fontName=FONT_NORMAL,
        textColor=GRAY, spaceBefore=8,
    )

    # Table cell styles — must use Paragraph for TTFont to render Unicode
    s_lbl = ParagraphStyle("rg_slbl", fontName=FONT_NORMAL, fontSize=9,  textColor=GRAY,  leading=12)
    s_num_lg = ParagraphStyle("rg_numlg", fontName=FONT_BOLD,   fontSize=16, textColor=NAVY,  leading=20)
    s_num_md = ParagraphStyle("rg_nummd", fontName=FONT_BOLD,   fontSize=13, textColor=NAVY,  leading=16)
    s_num_bl = ParagraphStyle("rg_numbl", fontName=FONT_BOLD,   fontSize=13, textColor=BLUE,  leading=16)

    th9  = ParagraphStyle("rg_th9",  fontName=FONT_BOLD,   fontSize=9,  textColor=white, leading=12)
    td9  = ParagraphStyle("rg_td9",  fontName=FONT_NORMAL, fontSize=9,  textColor=black, leading=12)
    td9r = ParagraphStyle("rg_td9r", fontName=FONT_NORMAL, fontSize=9,  textColor=black, leading=12, alignment=TA_RIGHT)
    td9b = ParagraphStyle("rg_td9b", fontName=FONT_BOLD,   fontSize=9,  textColor=black, leading=12)
    td9br= ParagraphStyle("rg_td9br",fontName=FONT_BOLD,   fontSize=9,  textColor=black, leading=12, alignment=TA_RIGHT)

    th8  = ParagraphStyle("rg_th8",  fontName=FONT_BOLD,   fontSize=8,  textColor=white, leading=11)
    td8  = ParagraphStyle("rg_td8",  fontName=FONT_NORMAL, fontSize=8,  textColor=black, leading=11)
    td8r = ParagraphStyle("rg_td8r", fontName=FONT_NORMAL, fontSize=8,  textColor=black, leading=11, alignment=TA_RIGHT)
    td8c = ParagraphStyle("rg_td8c", fontName=FONT_NORMAL, fontSize=8,  textColor=black, leading=11, alignment=TA_CENTER)

    def hu_fmt(n):
        return f"{float(n or 0):,.0f} Ft".replace(",", " ")  # narrow no-break space

    story = []

    # ── Header ──────────────────────────────────────────────────
    story.append(Paragraph("Számla összesítő", title_style))
    story.append(Paragraph(
        f"{company_name}  ·  {period_label}  ·  "
        f"Generálva: {datetime.now().strftime('%Y.%m.%d %H:%M')}",
        subtitle_style,
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=BLUE, spaceAfter=16))

    # ── Summary cards ────────────────────────────────────────────
    total_gross    = sum(float(i.get("amount_gross") or 0) for i in invoices)
    total_vat      = sum(float(i.get("amount_vat")   or 0) for i in invoices)
    total_net      = sum(float(i.get("amount_net")   or 0) for i in invoices)
    exported_count = sum(1 for i in invoices if i.get("status") == "exported")
    pending_count  = sum(1 for i in invoices if i.get("status") in ("extracted", "pending_review"))

    summary_data = [
        [_p("Összes számla", s_lbl), _p("Exportálva", s_lbl),        _p("Függőben", s_lbl),         _p("", s_lbl)],
        [_p(len(invoices),   s_num_lg), _p(exported_count, s_num_lg),_p(pending_count, s_num_lg),   _p("", s_lbl)],
        [_p("Nettó összeg",  s_lbl), _p("ÁFA összeg", s_lbl),        _p("Bruttó összeg", s_lbl),    _p("", s_lbl)],
        [_p(hu_fmt(total_net), s_num_md), _p(hu_fmt(total_vat), s_num_md), _p(hu_fmt(total_gross), s_num_bl), _p("", s_lbl)],
    ]

    summary_table = Table(summary_data, colWidths=[4*cm, 4*cm, 4*cm, 4.5*cm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), LIGHT),
        ("BACKGROUND",    (0, 2), (-1, 2), LIGHT),
        ("ALIGN",         (0, 0), (-1,-1), "LEFT"),
        ("VALIGN",        (0, 0), (-1,-1), "MIDDLE"),
        ("BOX",           (0, 0), (-1,-1), 0.5, BORDER),
        ("GRID",          (0, 0), (-1,-1), 0.25, BORDER),
        ("TOPPADDING",    (0, 0), (-1,-1), 8),
        ("BOTTOMPADDING", (0, 0), (-1,-1), 8),
        ("LEFTPADDING",   (0, 0), (-1,-1), 8),
        ("RIGHTPADDING",  (0, 0), (-1,-1), 8),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 28))

    # ── ÁFA breakdown ────────────────────────────────────────────
    story.append(Paragraph("ÁFA összesítő", section_style))

    vat_groups = defaultdict(lambda: {"count": 0, "net": 0.0, "vat": 0.0, "gross": 0.0})
    for inv in invoices:
        cat = inv.get("vat_category") or "Ismeretlen"
        vat_groups[cat]["count"] += 1
        vat_groups[cat]["net"]   += float(inv.get("amount_net")   or 0)
        vat_groups[cat]["vat"]   += float(inv.get("amount_vat")   or 0)
        vat_groups[cat]["gross"] += float(inv.get("amount_gross") or 0)

    vat_data = [[
        _p("ÁFA kategória", th9), _p("Db", th9),
        _p("Nettó", th9), _p("ÁFA", th9), _p("Bruttó", th9),
    ]]
    for cat, d in sorted(vat_groups.items()):
        vat_data.append([
            _p(cat,            td9),
            _p(d["count"],     td9),
            _p(hu_fmt(d["net"]),   td9r),
            _p(hu_fmt(d["vat"]),   td9r),
            _p(hu_fmt(d["gross"]), td9r),
        ])
    vat_data.append([
        _p("ÖSSZESEN",         td9b),
        _p(len(invoices),      td9b),
        _p(hu_fmt(total_net),  td9br),
        _p(hu_fmt(total_vat),  td9br),
        _p(hu_fmt(total_gross),td9br),
    ])

    vat_table = Table(vat_data, colWidths=[5*cm, 1.5*cm, 4*cm, 4*cm, 4*cm])
    vat_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1,  0), NAVY),
        ("BACKGROUND",    (0,-1), (-1, -1), LIGHT),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("GRID",          (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("ROWBACKGROUND", (0, 1), (-1, -2), [white, LIGHT]),
    ]))
    story.append(vat_table)
    story.append(Spacer(1, 28))

    # ── Invoice list ─────────────────────────────────────────────
    story.append(Paragraph("Számlák részletei", section_style))

    STATUS_HU = {
        "extracted":      "Kinyerve",
        "pending_review": "Felülvizsgálat",
        "verified":       "Ellenőrizve",
        "exported":       "Exportálva",
        "rejected":       "Elutasítva",
    }

    inv_data = [[
        _p("#",            th8), _p("Számlaszám", th8), _p("Kibocsátó", th8),
        _p("Esedékesség",  th8), _p("Bruttó",    th8), _p("Státusz",   th8),
    ]]
    for i, inv in enumerate(sorted(invoices, key=lambda x: x.get("due_date") or ""), 1):
        inv_data.append([
            _p(i,                                                      td8c),
            _p(inv.get("invoice_number") or "—",                       td8),
            _p((inv.get("vendor_name") or "—")[:30],                   td8),
            _p(str(inv.get("due_date") or "")[:10],                    td8),
            _p(hu_fmt(inv.get("amount_gross")),                        td8r),
            _p(STATUS_HU.get(inv.get("status"), inv.get("status") or "—"), td8),
        ])

    inv_table = Table(inv_data, colWidths=[0.8*cm, 4.2*cm, 5.8*cm, 2.5*cm, 3.2*cm, 2.5*cm])
    inv_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1,  0), NAVY),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("GRID",          (0, 0), (-1, -1), 0.2, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("ROWBACKGROUND", (0, 1), (-1, -1), [white, LIGHT]),
    ]))
    story.append(inv_table)

    # ── Footer ───────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER))
    story.append(Paragraph(
        f"Generálta: DocuAgent V4  ·  {generated_by}  ·  "
        f"{datetime.now().strftime('%Y.%m.%d %H:%M')}",
        footer_style,
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()
