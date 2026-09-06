-- 065: issue module + environment fields for risk signal collection (docs/55 §2.5)
-- NULL-able — existing flows unaffected; risk signals simply skip NULL rows.

ALTER TABLE issues ADD COLUMN IF NOT EXISTS module VARCHAR(100);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS environment VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_issues_module ON issues(tenant_id, module);
CREATE INDEX IF NOT EXISTS idx_issues_environment ON issues(tenant_id, environment);
