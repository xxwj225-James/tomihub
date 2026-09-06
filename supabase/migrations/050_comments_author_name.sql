-- Add author_name to comments (used by activity/project activity queries)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_name VARCHAR(100);
