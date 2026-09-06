-- Migration: 009_mcp_audit_enhancements
-- Description: mcp_audit_logs table (DB-backed) + mcp_hitl_tasks table (pending tasks)
-- ROLLBACK: DROP TABLE IF EXISTS mcp_hitl_tasks CASCADE; DROP TABLE IF EXISTS mcp_audit_logs CASCADE;

-- Audit log for completed MCP operations
CREATE TABLE IF NOT EXISTS mcp_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36),
    tool_name VARCHAR(255) NOT NULL,
    arguments TEXT DEFAULT '{}',
    status VARCHAR(20) NOT NULL,
    result TEXT DEFAULT '{}',
    confirmed_by VARCHAR(36),
    issue_key VARCHAR(50),
    agent_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_tenant ON mcp_audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_status ON mcp_audit_logs (tenant_id, status);

-- Pending HITL tasks awaiting user confirmation
CREATE TABLE IF NOT EXISTS mcp_hitl_tasks (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36),
    tool_name VARCHAR(255) NOT NULL,
    arguments TEXT DEFAULT '{}',
    agent_name VARCHAR(100),
    issue_key VARCHAR(50),
    issue_title TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_mcp_hitl_tasks_tenant ON mcp_hitl_tasks (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mcp_hitl_tasks_pending ON mcp_hitl_tasks (status) WHERE status = 'pending';
