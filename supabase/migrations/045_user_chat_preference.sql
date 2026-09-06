-- Migration 045: User chat history save preference
-- Let each user decide whether to persist their AI chat history.
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_save_history BOOLEAN NOT NULL DEFAULT FALSE;
