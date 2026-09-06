-- Migration: 20260608000005_ai_memory_system
-- Description: AI Memory Chronicle table + pgvector + MCP audit log
-- ROLLBACK: DROP TABLE IF EXISTS ai_memory_chronicles, mcp_audit_logs CASCADE;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- AI Memory Chronicle
CREATE TABLE IF NOT EXISTS ai_memory_chronicles (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36),
    event_type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    summary TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    actor_id VARCHAR(36),
    resource_type VARCHAR(50),
    resource_id VARCHAR(36),
    importance_score INT DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    embedding vector(768),
    is_summarized BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chronicles_project_time
    ON ai_memory_chronicles (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chronicles_type
    ON ai_memory_chronicles (project_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chronicles_importance
    ON ai_memory_chronicles (project_id, importance_score DESC)
    WHERE importance_score > 50;
CREATE INDEX IF NOT EXISTS idx_chronicles_tenant
    ON ai_memory_chronicles (tenant_id, is_deleted);

-- pgvector index (for semantic search)
-- Created later after data exists: CREATE INDEX ON ai_memory_chronicles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Soft delete flag on issues for vector cleanup
ALTER TABLE issues ADD COLUMN IF NOT EXISTS embedding_pending_delete BOOLEAN DEFAULT FALSE;

-- MCP Audit Log
CREATE TABLE IF NOT EXISTS mcp_audit_logs (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36),
    tool_name VARCHAR(50) NOT NULL,
    arguments JSONB DEFAULT '{}',
    status VARCHAR(20) NOT NULL,
    result JSONB,
    confirmed_by VARCHAR(36),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_tenant ON mcp_audit_logs (tenant_id, created_at DESC);
