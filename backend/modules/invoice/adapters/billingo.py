"""
Billingo API v3 adapter.
Handles partner lookup/creation and expense recording.

Note: We record INCOMING invoices (expenses), not outgoing ones.
Billingo v3 is primarily for outgoing documents; we use the document API
with a note linking back to the original invoice number.
"""
import httpx
import logging
from typing import Optional

log = logging.getLogger("docuagent")

BILLINGO_BASE = "https://api.billingo.hu/v3"


def _vat_rate_to_billingo(vat_rate) -> str:
    return "TAM"


def _payment_method(pm: str) -> str:
    pm_lower = (pm or "").lower().strip()
    if any(x in pm_lower for x in ["utalás", "utalas", "transfer", "wire"]):
        return "elore_utalas"
    if any(x in pm_lower for x in ["készpénz", "keszpenz", "cash"]):
        return "cash"
    if any(x in pm_lower for x in ["kártya", "kartya", "card"]):
        return "bankcard"
    return "elore_utalas"


class BillingoAdapter:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "X-API-KEY":    api_key,
            "Content-Type": "application/json",
        }

    async def test_connection(self) -> bool:
        """Verify API key works — returns True if 200 OK."""
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{BILLINGO_BASE}/bank-accounts", headers=self.headers)
            return r.status_code == 200

    async def find_or_create_partner(
        self, vendor_name: str, tax_id: Optional[str] = None
    ) -> dict:
        """
        Find existing partner by tax_id or name; create if not found.
        Returns Billingo partner object.
        """
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{BILLINGO_BASE}/partners",
                headers=self.headers,
                params={"query": vendor_name, "per_page": 5},
            )
            if r.status_code == 200:
                partners = r.json().get("data", [])

                # Exact match by tax number (preferred)
                if tax_id:
                    clean = tax_id.replace("-", "").replace(" ", "")
                    for p in partners:
                        p_tax = (p.get("taxcode") or "").replace("-", "").replace(" ", "")
                        if p_tax and p_tax == clean:
                            log.info(f"Billingo partner found by tax_id: {p['id']}")
                            return p

                # Fuzzy name match (handles Kft. / Kft / KFT variants)
                v_name = vendor_name.lower().replace(".", "").replace(" ", "")
                for p in partners:
                    p_name = (p.get("name") or "").lower().replace(".", "").replace(" ", "")
                    if p_name and (p_name == v_name or p_name in v_name or v_name in p_name):
                        log.info(f"Billingo partner found by name (fuzzy): {p['id']}")
                        return p

            # Create new partner
            payload = {
                "name":    vendor_name,
                "taxcode": tax_id or "",
                "type":    "company",
                "emails":  [],
                "address": {
                    "country_code": "HU",
                    "post_code":    "0000",
                    "city":         "Ismeretlen",
                    "address":      "--",
                },
            }
            r = await client.post(
                f"{BILLINGO_BASE}/partners",
                headers=self.headers,
                json=payload,
            )
            if r.status_code not in (200, 201):
                raise ValueError(
                    f"Billingo partner create failed {r.status_code}: {r.text[:200]}"
                )
            partner = r.json()
            log.info(f"Billingo partner created: {partner.get('id')}")
            return partner

    async def create_expense_document(self, invoice: dict, partner_id: int) -> dict:
        """
        Create a Billingo document representing the incoming expense.
        Uses a single HTTP client session for both block lookup and document creation.
        """
        from datetime import date

        def fmt_date(d) -> str:
            if not d:
                return date.today().isoformat()
            if hasattr(d, "isoformat"):
                return d.isoformat()
            return str(d)[:10]

        async with httpx.AsyncClient(timeout=30) as client:
            # Fetch document blocks — required integer id
            blocks_resp = await client.get(f"{BILLINGO_BASE}/document-blocks", headers=self.headers)
            if blocks_resp.status_code != 200:
                raise ValueError(
                    "Nem sikerült lekérni a Billingo dokumentum blokkokat. "
                    "Ellenőrizze az API kulcsot."
                )
            blocks = blocks_resp.json().get("data", [])
            if not blocks:
                raise ValueError(
                    "Nincs dokumentum blokk a Billingo fiókban. "
                    "Hozzon létre egyet a Billingo felületen."
                )
            block_id = blocks[0]["id"]

            vat_value = _vat_rate_to_billingo(invoice.get("vat_rate"))
            log.info(f"Using VAT value: {vat_value} for rate {invoice.get('vat_rate')}")

            payload = {
                "partner_id":       partner_id,
                "block_id":         block_id,
                "type":             "invoice",
                "fulfillment_date": fmt_date(invoice.get("issue_date")),
                "due_date":         fmt_date(invoice.get("due_date")),
                "payment_method":   _payment_method(invoice.get("payment_method")),
                "language":         "hu",
                "currency":         invoice.get("currency", "HUF"),
                "conversion_rate":  1,
                "electronic":       True,
                "comment":          f"DocuAgent import: {invoice.get('invoice_number', '')}",
                "items": [{
                    "name":            f"Bejövő számla: {invoice.get('invoice_number', 'N/A')}",
                    "quantity":        1,
                    "unit":            "db",
                    "unit_price":      float(invoice.get("amount_net") or 1),
                    "unit_price_type": "net",
                    "vat":             vat_value,
                }],
            }

            r = await client.post(
                f"{BILLINGO_BASE}/documents",
                headers=self.headers,
                json=payload,
            )
            if r.status_code not in (200, 201):
                raise ValueError(
                    f"Billingo document create failed {r.status_code}: {r.text[:300]}"
                )
            doc = r.json()
            log.info(f"Billingo document created: {doc.get('id')}")
            return doc
