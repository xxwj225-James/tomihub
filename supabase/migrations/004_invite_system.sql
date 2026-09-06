-- Migration: 20260608000004_invite_system
-- Description: Tenant registration mode + member invites
-- ROLLBACK: DROP TABLE IF EXISTS invites CASCADE;
--           ALTER TABLE tenants DROP COLUMN IF EXISTS registration_mode;

-- Tenant registration mode
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS registration_mode VARCHAR(20) DEFAULT 'open';
-- 'open' = anyone can register and auto-join
-- 'invite_only' = must have a valid invite to register

-- Invites table
CREATE TABLE IF NOT EXISTS invites (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,          -- invite code (random token)
    role VARCHAR(20) DEFAULT 'member',         -- role assigned on accept
    invited_by VARCHAR(36) REFERENCES users(id),
    expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',       -- pending | accepted | expired | revoked
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_email_tenant ON invites(email, tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code) WHERE status = 'pending';
