-- Migration: 026_ai_decision_feedbacks
-- Description: AI decision feedback table — captures implicit human corrections
-- ROLLBACK: DROP TABLE IF EXISTS ai_decision_feedbacks CASCADE;

CREATE TABLE IF NOT EXISTS ai_decision_feedbacks (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36),
    resource_id VARCHAR(36),                 -- Issue ID / Report ID for fast indexed lookup
    feature_type VARCHAR(32) NOT NULL,       -- ISSUE_ASSIGN / ISSUE_REOPEN / HEALTH_RISK / REPORT_CORRECT
    ai_output TEXT NOT NULL,                 -- AI original output
    human_action VARCHAR(16) NOT NULL,       -- ACCEPT / REJECT / IGNORE / CORRECT
    human_corrected_output TEXT,             -- human-corrected result (for REJECT / CORRECT)
    context JSONB DEFAULT '{}',              -- snapshot of related data at decision time
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_resource ON ai_decision_feedbacks (resource_id);
CREATE INDEX IF NOT EXISTS idx_feedback_tenant_feature ON ai_decision_feedbacks (tenant_id, feature_type, created_at DESC);

ALTER TABLE ai_decision_feedbacks ENABLE ROW LEVEL SECURITY;
