-- issues.workload missing — Issue entity (backend/ai-pm-core) maps a workload
-- field, but the column was never added. MyBatis-Plus selectById fails with
-- 'column "workload" does not exist' → issue detail page returns 500.
ALTER TABLE issues ADD COLUMN IF NOT EXISTS workload DOUBLE PRECISION;
