-- ==========================================
-- Migration: 20260606000003_issue_security_indexes
-- Description: Performance indexes for Issue Security Level filtering
--   - Partial indexes to skip public issues (majority)
--   - Composite index for visible-level lookup
--   - Avoids per-row JOIN on issue_security_members in list queries
-- ROLLBACK: DROP INDEX IF EXISTS idx_issues_public, idx_issues_security, idx_ism_lookup;
-- ==========================================

-- ★ Public issues (no security level) are the majority — partial index skips NULL
CREATE INDEX IF NOT EXISTS idx_issues_public
    ON issues (project_id, status, created_at DESC)
    WHERE security_level_id IS NULL;

-- ★ Issues with a security level — used for IN (sl-1, sl-3) filtering
CREATE INDEX IF NOT EXISTS idx_issues_security
    ON issues (project_id, security_level_id, status)
    WHERE security_level_id IS NOT NULL;

-- ★ One-shot query: all security_levels visible to a user in a project
-- SELECT security_level_id FROM issue_security_members
-- WHERE security_level_id IN (all project security levels)
--   AND (user_id = ? OR role_id = ?)
CREATE INDEX IF NOT EXISTS idx_ism_lookup
    ON issue_security_members (security_level_id, user_id, role_id);
