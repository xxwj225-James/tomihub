-- Add missing columns to api_keys (used by MyBatis-Plus entity)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS hitl_mode VARCHAR(20) DEFAULT 'manual';
-- scopes column type fix: entity stores comma-separated string, not JSON
ALTER TABLE api_keys ALTER COLUMN scopes TYPE text;
-- created_by not managed by entity — allow null
ALTER TABLE api_keys ALTER COLUMN created_by DROP NOT NULL;
