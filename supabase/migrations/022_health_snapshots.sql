-- Migration: 022_health_snapshots
-- Description: Store project health score history for trend analysis
-- ROLLBACK: DROP TABLE IF EXISTS project_health_snapshots;

CREATE TABLE IF NOT EXISTS project_health_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    health_score INT,
    dimensions JSONB DEFAULT '{}',
    summary TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_snapshots_project
    ON project_health_snapshots(project_id, recorded_at DESC);

-- Keep only last 180 days of snapshots (auto-cleanup)
-- Run via: DELETE FROM project_health_snapshots WHERE recorded_at < NOW() - INTERVAL '180 days';
