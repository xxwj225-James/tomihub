-- Migration: 030_hitl_configs
-- Description: HITL per-user/agent configuration table (was missing)
-- ROLLBACK: DROP TABLE IF EXISTS hitl_configs CASCADE;

CREATE TABLE IF NOT EXISTS hitl_configs (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    agent_name VARCHAR(100) DEFAULT 'default',
    mode VARCHAR(20) DEFAULT 'manual',
    is_global_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id, agent_name)
);
