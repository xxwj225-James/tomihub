-- Migration: 044_knowledge_page_sample
-- Description: Add is_sample flag to knowledge_pages for wiki template tracking
-- ROLLBACK: ALTER TABLE knowledge_pages DROP COLUMN IF EXISTS is_sample;

ALTER TABLE knowledge_pages ADD COLUMN IF NOT EXISTS is_sample BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN knowledge_pages.is_sample IS 'TRUE if this page was auto-generated as a template. Set to FALSE when user edits content.';
