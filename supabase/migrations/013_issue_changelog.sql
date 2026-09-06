-- Migration 013: issue_changelog indexes
-- Description: Additional indexes for issue change tracking performance
-- Table defined in 001_initial_schema.sql (non-partitioned)
-- ROLLBACK: DROP INDEX IF EXISTS idx_issue_changelog_issue, idx_issue_changelog_field;

CREATE INDEX IF NOT EXISTS idx_issue_changelog_issue
    ON issue_changelog (issue_id, created_at);

CREATE INDEX IF NOT EXISTS idx_issue_changelog_field
    ON issue_changelog (field, created_at);
