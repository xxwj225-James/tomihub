-- Migration: 037_versions_table
-- Description: Create versions table for release/version management
-- ROLLBACK: DROP TABLE IF EXISTS versions;

CREATE TABLE IF NOT EXISTS versions (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ,
    release_date TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    category VARCHAR(20) NOT NULL DEFAULT 'release',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id, sort_order);
