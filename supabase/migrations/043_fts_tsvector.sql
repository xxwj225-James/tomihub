-- Migration: 043_fts_tsvector
-- Description: Add tsvector generated columns + GIN indexes for full-text search
--              Replaces Python substring matching with PostgreSQL FTS.
--              Combined with vector search via RRF (Reciprocal Rank Fusion).
-- ROLLBACK:
--   ALTER TABLE knowledge_pages DROP COLUMN IF EXISTS tsv;
--   ALTER TABLE issues DROP COLUMN IF EXISTS tsv;
--   ALTER TABLE projects DROP COLUMN IF EXISTS tsv;
--   ALTER TABLE comments DROP COLUMN IF EXISTS tsv;
--   DROP INDEX IF EXISTS idx_kp_tsv;
--   DROP INDEX IF EXISTS idx_issues_tsv;
--   DROP INDEX IF EXISTS idx_projects_tsv;
--   DROP INDEX IF EXISTS idx_comments_tsv;

-- ═══ tsvector generated columns ═══
-- Uses 'english' config: stems English words, preserves CJK characters as-is.
-- Generated columns auto-update on INSERT/UPDATE — no trigger needed.

ALTER TABLE knowledge_pages
    ADD COLUMN IF NOT EXISTS tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))) STORED;

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))) STORED;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))) STORED;

ALTER TABLE comments
    ADD COLUMN IF NOT EXISTS tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(body,''))) STORED;

-- ═══ GIN indexes for fast full-text search ═══
-- GIN (Generalized Inverted Index) is the standard index for tsvector.
-- Much faster than GIST for read-heavy workloads (our case).

CREATE INDEX IF NOT EXISTS idx_kp_tsv ON knowledge_pages USING gin(tsv);
CREATE INDEX IF NOT EXISTS idx_issues_tsv ON issues USING gin(tsv);
CREATE INDEX IF NOT EXISTS idx_projects_tsv ON projects USING gin(tsv);
CREATE INDEX IF NOT EXISTS idx_comments_tsv ON comments USING gin(tsv);
