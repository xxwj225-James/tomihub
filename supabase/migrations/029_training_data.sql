-- Migration: 029_training_data
-- Description: RLHF training pairs — accumulate (prompt → correct_output) for future LoRA fine-tuning
-- ROLLBACK: DROP TABLE IF EXISTS ai_training_pairs CASCADE;

CREATE TABLE IF NOT EXISTS ai_training_pairs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    resource_id VARCHAR(36),                 -- source Issue / Report ID
    task_type VARCHAR(32) NOT NULL,          -- ISSUE_REVIEW / REPORT_GEN / ASSIGN_SUGGEST
    input_prompt TEXT NOT NULL,              -- original prompt sent to AI
    correct_output TEXT NOT NULL,            -- human-corrected version (chosen)
    ai_output TEXT,                          -- AI original output (rejected — for DPO comparison)
    quality_score NUMERIC(3,2),              -- 0.0 ~ 1.0 (1.0 = full accept, -0.5 = reopen)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_tenant_quality ON ai_training_pairs (tenant_id, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_training_resource ON ai_training_pairs (resource_id);

ALTER TABLE ai_training_pairs ENABLE ROW LEVEL SECURITY;
