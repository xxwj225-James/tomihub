-- Migration 012: ai_analyses cache table
-- Description: Cache table for AI analysis results (health scores, risk analysis, etc.)
-- ROLLBACK: DROP TABLE IF EXISTS ai_analyses CASCADE;

CREATE TABLE IF NOT EXISTS ai_analyses (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36),
    user_id VARCHAR(36),
    analysis_type VARCHAR(50) NOT NULL,
    input_summary TEXT,
    result JSONB NOT NULL,
    model_used VARCHAR(100),
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_lookup
    ON ai_analyses (tenant_id, user_id, project_id, analysis_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_project
    ON ai_analyses (project_id, analysis_type, created_at DESC);
