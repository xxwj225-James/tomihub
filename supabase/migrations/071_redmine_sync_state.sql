-- Migration: 20260701000071_redmine_sync_state
-- Description: Sync-state table for the Redmine → TomiHub connector
-- (ai-brain/redmine_connector). Stores the updated_on cursor + last run status
-- per (tenant, redmine_url, project_key) so incremental syncs can resume.
-- ROLLBACK: DROP TABLE IF EXISTS redmine_sync_state;

CREATE TABLE IF NOT EXISTS redmine_sync_state (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    redmine_url VARCHAR(255) NOT NULL,
    project_key VARCHAR(100) NOT NULL,
    last_issue_updated VARCHAR(40),
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    UNIQUE(tenant_id, redmine_url, project_key)
);
