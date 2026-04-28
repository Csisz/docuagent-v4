-- DocuAgent V4 — Migration 005: Superadmin support
-- Adds is_superadmin flag to users table.
-- Superadmin can see and manage ALL tenants (Agentify operator level).
-- Regular tenant admins can only manage their own tenant.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;

-- Index for fast superadmin lookup
CREATE INDEX IF NOT EXISTS idx_users_superadmin ON users(is_superadmin) WHERE is_superadmin = TRUE;

-- Add tenant_settings table for per-tenant config key-value store
-- Used by admin to set plan-level overrides, custom quotas, etc.
CREATE TABLE IF NOT EXISTS tenant_settings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    value       JSONB NOT NULL DEFAULT '{}',
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings ON tenant_settings(tenant_id);
