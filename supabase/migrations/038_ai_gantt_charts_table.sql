-- Migration: 038_ai_gantt_charts
-- Description: Create ai_gantt_charts table for AI-generated Gantt chart storage
-- ROLLBACK: DROP TABLE IF EXISTS ai_gantt_charts;

CREATE TABLE IF NOT EXISTS ai_gantt_charts (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255),
    chart_data_jsonb JSONB DEFAULT '{}',
    ai_rationale TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_gantt_active ON ai_gantt_charts(tenant_id, project_id, is_active);
