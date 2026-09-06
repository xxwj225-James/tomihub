-- Migration: 018_setup_wizard
-- Description: Add gender + onboarding_completed to users table
-- ROLLBACK: ALTER TABLE users DROP COLUMN IF EXISTS gender; ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed;

ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_language VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_language VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
-- Existing users (created before this migration) don't need onboarding
UPDATE users SET onboarding_completed = TRUE WHERE onboarding_completed IS NULL;
