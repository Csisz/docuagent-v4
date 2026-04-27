"""
OCR Engine for DocuAgent V4.
Extracts plain text from uploaded invoice files (PDF, image, DOCX).
All calls go through extract_text(); modules never call this directly.
"""
import asyncio
import base64
import json
import logging
from pathlib import Path

import httpx

from core.config import OPENAI_API_KEY

log = logging.getLogger("docuagent")

SUPPORTED_IMAGE = {".jpg", ".jpeg", ".png", ".webp"}
SUPPORTED_PDF   = {".pdf"}
SUPPORTED_DOCX  = {".docx"}

VISION_URL = "https://api.openai.com/v1/chat/completions"
VISION_MODEL = "gpt-4o"

_MIME = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
}

_SYSTEM_PROMPT = (
    "You are an OCR assistant. Extract ALL text from the provided image exactly as it appears, "
    "preserving line breaks and table structure. Output plain text only — no commentary, "
    "no markdown formatting, no explanations."
)


async def extract_text(file_path: str, filename: str) -> str:
    """Main entry point. Returns extracted plain text from the given file."""
    suffix = Path(filename).suffix.lower()
    if suffix in SUPPORTED_IMAGE:
        return await _extract_from_image(file_path, suffix)
    if suffix in SUPPORTED_PDF:
        return await _extract_from_pdf(file_path)
    if suffix in SUPPORTED_DOCX:
        return _extract_from_docx(file_path)
    raise ValueError(f"Unsupported file type: {suffix}")


async def _extract_from_image(file_path: str, suffix: str) -> str:
    mime = _MIME.get(suffix, "image/jpeg")
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    payload = {
        "model": VISION_MODEL,
        "max_tokens": 4096,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _SYSTEM_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"}},
                ],
            }
        ],
    }
    return await _vision_call(payload)


async def _extract_from_pdf(file_path: str) -> str:
    try:
        import fitz  # pymupdf
        doc = fitz.open(file_path)
        pages_text = [page.get_text() for page in doc]
        full_text = "\n\n".join(t for t in pages_text if t.strip())
        if len(full_text.strip()) > 100:
            log.debug(f"PDF text extracted via pymupdf: {len(full_text)} chars")
            return full_text
        log.debug("PDF appears scanned — falling back to Vision on first page")
        return await _pdf_via_vision_fallback(file_path, doc)
    except ImportError:
        log.debug("pymupdf not available, using Vision fallback for PDF")
        return await _pdf_via_vision_fallback(file_path)


async def _pdf_via_vision_fallback(file_path: str, doc=None) -> str:
    """Render first page of PDF to image then call Vision."""
    try:
        if doc is None:
            import fitz
            doc = fitz.open(file_path)
        page = doc[0]
        mat = fitz.Matrix(2.0, 2.0)  # 2× zoom for better OCR quality
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
    except Exception as e:
        raise RuntimeError(f"Cannot render PDF page for Vision OCR: {e}") from e

    b64 = base64.b64encode(img_bytes).decode()
    payload = {
        "model": VISION_MODEL,
        "max_tokens": 4096,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _SYSTEM_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}},
                ],
            }
        ],
    }
    return await _vision_call(payload)


def _extract_from_docx(file_path: str) -> str:
    try:
        import docx
    except ImportError:
        raise RuntimeError("python-docx is not installed. Run: pip install python-docx")

    doc = docx.Document(file_path)
    parts = []

    for para in doc.paragraphs:
        if para.text.strip():
            parts.append(para.text)

    for table in doc.tables:
        for row in table.rows:
            row_text = "\t".join(cell.text.strip() for cell in row.cells)
            if row_text.strip():
                parts.append(row_text)

    return "\n".join(parts)


async def get_word_map(file_path: str, filename: str) -> list[dict]:
    """
    Extract ALL words from invoice with their relative positions (0.0-1.0).
    Returns list of {text, x, y, w, h, line} dicts, sorted top-to-bottom / left-to-right.
    Returns [] on any failure — callers must handle gracefully.
    """
    import re
    suffix = Path(filename).suffix.lower()

    if suffix == ".pdf":
        try:
            import fitz
            doc = fitz.open(file_path)
            page = doc[0]
            mat = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat)
            doc.close()
            img_bytes = pix.tobytes("png")
            media_type = "image/png"
        except Exception as e:
            log.warning(f"get_word_map: PDF render failed: {e}")
            return []
    elif suffix in {".jpg", ".jpeg"}:
        with open(file_path, "rb") as f:
            img_bytes = f.read()
        media_type = "image/jpeg"
    elif suffix in {".png", ".webp"}:
        with open(file_path, "rb") as f:
            img_bytes = f.read()
        media_type = "image/png"
    else:
        return []

    img_b64 = base64.b64encode(img_bytes).decode()

    prompt = """Analyze this invoice image and return a JSON array of ALL text tokens with their positions.

For each word or number group, return:
- "text": the exact text string
- "x": left edge position as fraction of image width (0.0 to 1.0)
- "y": top edge position as fraction of image height (0.0 to 1.0)
- "w": width as fraction of image width (0.0 to 1.0)
- "h": height as fraction of image height (0.0 to 1.0)
- "line": line number starting from 0

Rules:
- Keep numbers together: "32457377-2-11" is ONE token, not split
- Keep date parts together: "2026.04.18" is ONE token
- Currency amounts with spaces: "1 234 567" is one token
- Short words on same line: each word is a separate token
- Return ONLY valid JSON array, no explanation, no markdown
- Minimum 20 tokens, maximum 200 tokens
- Cover the ENTIRE document

Example format:
[
  {"text": "SZÁMLA", "x": 0.35, "y": 0.05, "w": 0.12, "h": 0.025, "line": 0},
  {"text": "E-NUART-2026-10", "x": 0.62, "y": 0.18, "w": 0.16, "h": 0.02, "line": 3}
]"""

    payload = {
        "model":       VISION_MODEL,
        "max_tokens":  4000,
        "temperature": 0,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {
                    "url": f"data:{media_type};base64,{img_b64}",
                    "detail": "high",
                }},
            ],
        }],
    }
    try:
        content = await _vision_call(payload)
    except Exception as e:
        log.error(f"get_word_map: Vision call failed after retries: {e}", exc_info=True)
        return []

    # Strip markdown fences if present
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content).strip()

    try:
        words = json.loads(content)
        result = []
        for w in words:
            if not isinstance(w.get("text"), str) or not w["text"].strip():
                continue
            result.append({
                "text": w["text"].strip(),
                "x":    max(0.0, min(1.0, float(w.get("x", 0)))),
                "y":    max(0.0, min(1.0, float(w.get("y", 0)))),
                "w":    max(0.002, min(1.0, float(w.get("w", 0.05)))),
                "h":    max(0.002, min(1.0, float(w.get("h", 0.02)))),
                "line": int(w.get("line", 0)),
            })
        result.sort(key=lambda t: (round(t["y"] * 20) / 20, t["x"]))
        log.debug(f"get_word_map: {len(result)} words extracted from {filename}")
        return result
    except Exception as e:
        log.warning(f"get_word_map: parse failed: {e}\ncontent: {content[:200]}")
        return []


async def get_preview_image(file_path: str, filename: str) -> tuple[str | None, str | None]:
    """
    Convert uploaded file to a preview PNG (base64).
    Returns (base64_string, media_type) or (None, None) if unsupported.
    """
    import base64
    suffix = Path(filename).suffix.lower()

    if suffix in SUPPORTED_IMAGE:
        mime = _MIME.get(suffix, "image/jpeg")
        with open(file_path, "rb") as f:
            data = f.read()
        return base64.b64encode(data).decode(), mime

    if suffix in SUPPORTED_PDF:
        try:
            import fitz
            doc = fitz.open(file_path)
            page = doc[0]
            mat = fitz.Matrix(150 / 72, 150 / 72)  # ~150 DPI
            pix = page.get_pixmap(matrix=mat)
            doc.close()
            return base64.b64encode(pix.tobytes("png")).decode(), "image/png"
        except ImportError:
            return None, None
        except Exception as e:
            log.warning(f"PDF preview failed: {e}")
            return None, None

    return None, None


async def extract_from_crop(
    file_path: str,
    filename: str,
    x: float,
    y: float,
    w: float,
    h: float,
    field_hint: str = "",
) -> str:
    """
    Extract text from a specific region (0.0–1.0 relative coords) of an invoice image.
    Returns extracted text string.
    """
    import base64 as _b64
    suffix = Path(filename).suffix.lower()

    # Get high-res pixel data
    if suffix in SUPPORTED_PDF:
        try:
            import fitz
            doc = fitz.open(file_path)
            page = doc[0]
            mat = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat)
            doc.close()
            img_bytes = pix.tobytes("png")
            media_type = "image/png"
        except Exception as e:
            raise RuntimeError(f"Cannot render PDF for crop: {e}") from e
    else:
        with open(file_path, "rb") as f:
            img_bytes = f.read()
        media_type = _MIME.get(suffix.lstrip("."), "image/jpeg")

    # Crop using pymupdf
    try:
        import fitz
        fmt = "png" if media_type == "image/png" else "jpeg"
        img_doc = fitz.open(stream=img_bytes, filetype=fmt)
        page = img_doc[0]
        r = page.rect
        clip = fitz.Rect(
            r.x0 + x * r.width,
            r.y0 + y * r.height,
            r.x0 + (x + w) * r.width,
            r.y0 + (y + h) * r.height,
        )
        pix = page.get_pixmap(clip=clip, matrix=fitz.Matrix(2, 2))
        img_doc.close()
        crop_b64  = _b64.b64encode(pix.tobytes("png")).decode()
        crop_mime = "image/png"
    except Exception:
        # fallback: send full image
        crop_b64  = _b64.b64encode(img_bytes).decode()
        crop_mime = media_type

    field_ctx = f"I am looking for the value of: {field_hint}. " if field_hint else ""
    prompt = (
        f"{field_ctx}"
        "Extract the text value from this cropped region of a Hungarian invoice. "
        "Return ONLY the extracted value, nothing else. "
        "For amounts: return just the number (e.g. '127000'). "
        "For dates: return in YYYY-MM-DD format. "
        "For tax numbers: return in format 12345678-1-42."
    )

    payload = {
        "model": VISION_MODEL,
        "max_tokens": 100,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {
                    "url": f"data:{crop_mime};base64,{crop_b64}",
                    "detail": "high",
                }},
            ],
        }],
    }
    return await _vision_call(payload)


async def _vision_call(payload: dict) -> str:
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    last_error = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post(VISION_URL, headers=headers, json=payload)
                r.raise_for_status()
                data = r.json()
                text = data["choices"][0]["message"]["content"]
                log.debug(f"OCR Vision: {len(text)} chars extracted")
                return text.strip()
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            last_error = e
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (429,) or e.response.status_code >= 500:
                last_error = e
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
            else:
                raise

    raise RuntimeError(f"Vision OCR failed after 3 attempts: {last_error}")
