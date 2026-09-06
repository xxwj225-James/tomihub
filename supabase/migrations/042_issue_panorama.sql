-- Migration: 20260719000042_issue_panorama
-- Description: AI Panorama analytics column for complex issues

ALTER TABLE issues ADD COLUMN IF NOT EXISTS ai_panorama JSONB DEFAULT NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS complexity_score DOUBLE PRECISION DEFAULT 0;

COMMENT ON COLUMN issues.ai_panorama IS 'AI-generated panorama analysis: timeline, bottleneck, debates, next_action';
COMMENT ON COLUMN issues.complexity_score IS 'AI complexity gate: >= 0.40 triggers panorama display';

-- Board alerts table for stagnation/bottleneck/rework detection
CREATE TABLE IF NOT EXISTS ai_board_alerts (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) NOT NULL,
    issue_id VARCHAR(36) NOT NULL,
    alert_type VARCHAR(30) NOT NULL,
    severity VARCHAR(10) DEFAULT 'warning',
    detail JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_board_alerts_project ON ai_board_alerts(project_id, alert_type);
