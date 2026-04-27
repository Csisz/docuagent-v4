-- DocuAgent V4 — Invoice Module Schema
-- Migration 002: invoice_documents table

CREATE TABLE IF NOT EXISTS invoice_documents (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_type      TEXT DEFAULT 'manual',
    source_id        TEXT,

    status           TEXT NOT NULL DEFAULT 'extracted',
    -- extracted -> pending_review -> verified -> exported -> rejected

    invoice_number   TEXT,
    vendor_name      TEXT,
    vendor_tax_id    TEXT,
    buyer_name       TEXT,
    amount_net       FLOAT,
    amount_vat       FLOAT,
    amount_gross     FLOAT,
    currency         TEXT DEFAULT 'HUF',
    vat_rate         FLOAT,
    vat_category     TEXT,
    issue_date       DATE,
    due_date         DATE,
    payment_method   TEXT,
    notes            TEXT,

    confidence       FLOAT DEFAULT 0.0,
    raw_extraction   JSONB DEFAULT '{}',
    extraction_model TEXT DEFAULT 'gpt-4o-mini',

    approval_id      UUID REFERENCES approval_requests(id),
    verified_by      UUID REFERENCES users(id),
    verified_at      TIMESTAMPTZ,
    rejection_reason TEXT,

    export_system    TEXT,
    export_id        TEXT,
    export_url       TEXT,
    exported_at      TIMESTAMPTZ,

    nav_status       TEXT DEFAULT 'not_required',

    -- Processing pipeline
    filename         TEXT,
    processing_status TEXT DEFAULT 'uploading',
    processing_error TEXT,
    preview_b64      TEXT,
    preview_ready    BOOLEAN DEFAULT FALSE,
    ocr_ready        BOOLEAN DEFAULT FALSE,
    word_map         JSONB,

    -- Validation
    validation_issues JSONB DEFAULT '[]',

    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_tenant  ON invoice_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status  ON invoice_documents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_due     ON invoice_documents(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_vendor  ON invoice_documents(tenant_id, vendor_name);