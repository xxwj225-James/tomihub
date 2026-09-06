-- 066: reopen counter for the reopen_rate risk signal (docs/55 §2.2 signal 7)
-- Incremented by IssueService when a closed issue is moved back to an open status.

ALTER TABLE issues ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_issues_reopen_count ON issues(tenant_id, reopen_count);
