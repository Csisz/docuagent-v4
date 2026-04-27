from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


class InvoiceExtractRequest(BaseModel):
    text: str = Field(..., min_length=10)
    source_type: str = "manual"
    source_id: Optional[str] = None
    extra_instructions: str = ""


class InvoiceUpdateRequest(BaseModel):
    invoice_number: Optional[str] = None
    vendor_name: Optional[str] = None
    vendor_tax_id: Optional[str] = None
    buyer_name: Optional[str] = None
    amount_net: Optional[float] = None
    amount_vat: Optional[float] = None
    amount_gross: Optional[float] = None
    currency: Optional[str] = None
    vat_rate: Optional[float] = None
    vat_category: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class InvoiceVerifyRequest(BaseModel):
    note: str = ""


class InvoiceRejectRequest(BaseModel):
    reason: str = Field(..., min_length=3)


class InvoiceExportRequest(BaseModel):
    system: str = Field(..., pattern="^(billingo|szamlazz|manual)$")


class CropExtractRequest(BaseModel):
    invoice_id: str
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)
    w: float = Field(..., gt=0.0, le=1.0)
    h: float = Field(..., gt=0.0, le=1.0)
    field_hint: str = ""
