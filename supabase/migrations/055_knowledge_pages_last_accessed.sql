-- knowledge_pages.last_accessed_at — track when a wiki page was last opened.
-- Powers the "last accessed" sort in the wiki Recently Updated list.
ALTER TABLE knowledge_pages ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
