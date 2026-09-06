-- Add invited flag to users table (registered via invite code)
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited BOOLEAN DEFAULT FALSE;
