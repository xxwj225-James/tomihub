-- Migration: 010_unified_notifications
-- Description: Single notifications table replacing mcp_audit_logs + mcp_hitl_tasks
-- ROLLBACK: DROP TABLE IF EXISTS notifications CASCADE;

DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,

    -- Event classification
    type VARCHAR(30) NOT NULL,           -- hitl_pending | issue_assigned | comment_mentioned | system_alert | ...
    subtype VARCHAR(30),                 -- approved | denied | expired | auto (for hitl_pending)

    -- Target
    target_user_id VARCHAR(36),

    -- Content
    title VARCHAR(255) NOT NULL,
    body TEXT,

    -- Source
    source_user_id VARCHAR(36),
    source_agent VARCHAR(100),
    source_type VARCHAR(20) NOT NULL DEFAULT 'user',

    -- Related entity
    issue_key VARCHAR(50),
    issue_title TEXT,
    link VARCHAR(500),

    -- Action
    action_type VARCHAR(20) DEFAULT 'none',   -- approve_deny | link | dismiss | none
    action_payload TEXT DEFAULT '{}',          -- JSON: {tool_name, arguments, agent_name}

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    version INT DEFAULT 0,                      -- optimistic lock
    client_request_id VARCHAR(255),             -- idempotency key from Agent (e.g., "phase-<projectId>-<phase>-<userId>")

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(36),
    read_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notif_tenant_type_status ON notifications (tenant_id, type, status);
CREATE INDEX IF NOT EXISTS idx_notif_tenant_target ON notifications (tenant_id, target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_notif_tenant_created ON notifications (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_pending_hitl ON notifications (tenant_id, created_at DESC) WHERE type = 'hitl_pending' AND status = 'pending';

-- Idempotency: one Agent request = one notification row
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_idempotent ON notifications (tenant_id, source_agent, client_request_id) WHERE client_request_id IS NOT NULL;
