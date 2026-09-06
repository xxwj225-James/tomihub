-- Migration: 20260608000007_join_links
-- Description: Reusable join links for open-registration workspaces
-- ROLLBACK: DROP TABLE IF EXISTS join_links CASCADE;

CREATE TABLE IF NOT EXISTS join_links (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(32) UNIQUE NOT NULL,          -- short code for URL
    description VARCHAR(255),                  -- "Engineering Team Link"
    role VARCHAR(20) DEFAULT 'member',         -- role assigned on join
    max_uses INT,                               -- NULL = unlimited
    use_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    requires_approval BOOLEAN DEFAULT FALSE,    -- if true, admin must approve each join
    created_by VARCHAR(36) REFERENCES users(id),
    expires_at TIMESTAMPTZ,                    -- NULL = never
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pending join requests table
CREATE TABLE IF NOT EXISTS join_requests (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    join_link_id VARCHAR(36) REFERENCES join_links(id) ON DELETE SET NULL,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_role VARCHAR(20) DEFAULT 'member',
    status VARCHAR(20) DEFAULT 'pending',      -- pending | approved | denied
    reviewed_by VARCHAR(36) REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_join_links_code ON join_links(code) WHERE is_active = TRUE;
