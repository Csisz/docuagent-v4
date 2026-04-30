-- DocuAgent V4 — Migration 006: Email Agent
CREATE TABLE IF NOT EXISTS email_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    message_id      TEXT,                          -- Gmail Message-ID (idempotency)
    thread_id       TEXT,                          -- Gmail Thread-ID
    subject         TEXT NOT NULL DEFAULT '',
    sender          TEXT NOT NULL DEFAULT '',
    recipient       TEXT,
    body            TEXT,
    body_html       TEXT,
    category        TEXT DEFAULT 'other',          -- complaint|inquiry|appointment|other
    status          TEXT NOT NULL DEFAULT 'new',   -- new|classified|ai_answered|needs_attention|approved|sent|rejected
    urgent          BOOLEAN DEFAULT FALSE,
    urgency_score   INT DEFAULT 0,
    confidence      FLOAT DEFAULT 0,
    sentiment       TEXT DEFAULT 'neutral',        -- positive|neutral|negative|angry
    ai_response     TEXT,                          -- generated reply draft
    ai_decision     JSONB DEFAULT '{}',            -- full classification output
    source_docs     JSONB DEFAULT '[]',            -- RAG sources used
    rag_confidence  FLOAT,
    domain_tag      TEXT,                          -- tax|invoice|null
    senior_required BOOLEAN DEFAULT FALSE,
    booking_intent  BOOLEAN DEFAULT FALSE,
    language        TEXT DEFAULT 'HU',
    gmail_label_id  TEXT,                          -- Gmail label applied
    sent_at         TIMESTAMPTZ,
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_tenant_status  ON email_messages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_email_tenant_created ON email_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_tenant_urgent  ON email_messages(tenant_id, urgent, urgency_score DESC);
CREATE INDEX IF NOT EXISTS idx_email_message_id     ON email_messages(message_id) WHERE message_id IS NOT NULL;
