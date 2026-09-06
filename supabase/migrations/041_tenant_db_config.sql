-- Migration: 041_tenant_db_config
-- Description: Per-tenant independent PostgreSQL database configuration

CREATE TABLE IF NOT EXISTS tenant_db_config (
    tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    host VARCHAR(255) NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 5432,
    database_name VARCHAR(255) NOT NULL DEFAULT '',
    username VARCHAR(255) NOT NULL DEFAULT '',
    password TEXT DEFAULT '',
    service_status VARCHAR(20) NOT NULL DEFAULT 'stopped',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE tenant_db_config IS 'Per-tenant independent PostgreSQL database configuration for physical data isolation';
