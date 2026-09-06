-- Migration: 023_user_health_snapshots
-- Description: Store personal health score history for trend analysis
-- ROLLBACK: DROP TABLE IF EXISTS user_health_snapshots;

CREATE TABLE IF NOT EXISTS user_health_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) REFERENCES projects(id) ON DELETE SET NULL,
    health_score INT NOT NULL,
    health_level VARCHAR(20) DEFAULT 'healthy',
    dimensions JSONB DEFAULT '{}',
    summary TEXT,
    total_issues INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_health_user
    ON user_health_snapshots(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_health_project
    ON user_health_snapshots(project_id, created_at DESC);

-- Keep last 365 days of personal health history
-- Cleanup: DELETE FROM user_health_snapshots WHERE created_at < NOW() - INTERVAL '365 days';
