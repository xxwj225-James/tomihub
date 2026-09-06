-- Migration: 019_role_id_columns
-- Description: Add role_id columns to bridge old string-based roles → new permission system
-- ROLLBACK: ALTER TABLE project_members DROP COLUMN IF EXISTS role_id;
-- ROLLBACK: ALTER TABLE tenant_members DROP COLUMN IF EXISTS role_id;

-- Bridge legacy string role to new role entity system
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS role_id VARCHAR(36) REFERENCES roles(id);
ALTER TABLE tenant_members ADD COLUMN IF NOT EXISTS role_id VARCHAR(36) REFERENCES roles(id);

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_pm_role_id ON project_members(role_id);
CREATE INDEX IF NOT EXISTS idx_tm_role_id ON tenant_members(role_id);
