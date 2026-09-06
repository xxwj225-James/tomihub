-- Migration 034: AI Health Feedback table
-- User-driven AI analysis calibration

CREATE TABLE IF NOT EXISTS ai_health_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(32) NOT NULL,
    project_id VARCHAR(32),
    user_id VARCHAR(32) NOT NULL,
    analysis_id VARCHAR(36),

    -- What type of analysis this feedback is for
    analysis_type VARCHAR(30) NOT NULL,    -- 'project_health' | 'personal_health'

    -- What the LLM output
    llm_score INT NOT NULL,
    llm_level VARCHAR(20) NOT NULL,

    -- User's verdict
    score_feedback VARCHAR(10),            -- 'too_low' | 'just_right' | 'too_high'
    level_feedback VARCHAR(20),            -- 'accurate' | 'not_accurate'
    user_level VARCHAR(20),                -- user's corrected level (if not_accurate)
    user_reason TEXT,                      -- why user disagreed

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_feedback_type ON ai_health_feedback(analysis_type, project_id);
CREATE INDEX IF NOT EXISTS idx_health_feedback_user ON ai_health_feedback(user_id, analysis_type);

-- Calibration rules table (Phase 2)
CREATE TABLE IF NOT EXISTS ai_calibration_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(32) NOT NULL,

    -- Scope
    analysis_type VARCHAR(30) NOT NULL,    -- 'project_health' | 'personal_health'
    project_id VARCHAR(32),                -- NULL = all projects
    user_id VARCHAR(32),                   -- NULL = all users (only for personal_health)

    -- Rule content
    name VARCHAR(200) NOT NULL,
    instruction TEXT NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
