-- DocuAgent V4 — Core Schema
-- Migration 001: tenants, users, feature flags, audit, approvals, metering
-- Run once after database creation.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. tenants
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'starter',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. users
CREATE TABLE IF NOT EXISTS users (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email            TEXT NOT NULL,
    hashed_password  TEXT NOT NULL,
    full_name        TEXT,
    role             TEXT NOT NULL DEFAULT 'agent',
    -- role values: admin | agent | viewer | senior_approver
    is_active        BOOLEAN DEFAULT TRUE,
    last_login       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- 3. tenant_api_keys
CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash    TEXT UNIQUE NOT NULL,
    key_prefix  TEXT NOT NULL,
    label       TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    last_used   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. tenant_features (feature flags)
CREATE TABLE IF NOT EXISTS tenant_features (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module      TEXT NOT NULL,
    enabled     BOOLEAN DEFAULT FALSE,
    config      JSONB DEFAULT '{}',
    enabled_at  TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    UNIQUE(tenant_id, module)
);

-- 5. audit_log (append-only, never delete)
CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID,
    user_id       UUID,
    action        TEXT NOT NULL,
    resource_type TEXT,
    resource_id   TEXT,
    details       JSONB DEFAULT '{}',
    ip_address    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 6. approval_requests
CREATE TABLE IF NOT EXISTS approval_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    resource_type   TEXT NOT NULL,
    resource_id     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    -- status: pending | approved | rejected | escalated | expired
    requested_by    TEXT,
    confidence      FLOAT,
    data            JSONB DEFAULT '{}',
    requires_senior BOOLEAN DEFAULT FALSE,
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    note            TEXT,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 7. usage_records
CREATE TABLE IF NOT EXISTS usage_records (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    module              TEXT NOT NULL DEFAULT 'core',
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    emails_processed    INT DEFAULT 0,
    ai_calls_made       INT DEFAULT 0,
    tokens_consumed     BIGINT DEFAULT 0,
    cost_usd            FLOAT DEFAULT 0,
    documents_stored    INT DEFAULT 0,
    rag_queries         INT DEFAULT 0,
    UNIQUE(tenant_id, module, period_start)
);

-- 8. ai_usage_log
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID,
    module      TEXT,
    model       TEXT,
    task_type   TEXT,
    tokens_used INT,
    cost_usd    FLOAT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant       ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_date  ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action       ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_approval_tenant    ON approval_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_features_tenant    ON tenant_features(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_tenant       ON usage_records(tenant_id, period_start);
CREATE INDEX IF NOT EXISTS idx_ai_log_tenant      ON ai_usage_log(tenant_id, created_at DESC);
