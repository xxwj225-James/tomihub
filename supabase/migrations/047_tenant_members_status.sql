-- Add status column to tenant_members (used for disable/enable member check)
ALTER TABLE tenant_members ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
