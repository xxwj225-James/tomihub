-- Migration: 021_embedding_projects_comments
-- Description: Add embedding columns on projects + comments, create ivfflat indexes
-- ROLLBACK: ALTER TABLE projects DROP COLUMN IF EXISTS embedding; ALTER TABLE comments DROP COLUMN IF EXISTS embedding;
--           DROP INDEX IF EXISTS idx_projects_embedding; DROP INDEX IF EXISTS idx_comments_embedding;

-- ═══ Embedding columns ═══
-- Use vector WITHOUT dimension constraint — survives model changes
-- (bge-m3→1024d, nomic→768d, mxbai→1024d — all work)
-- pgvector stores dimension in 4-byte header, index adapts automatically
ALTER TABLE projects ADD COLUMN IF NOT EXISTS embedding vector;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS embedding vector;

-- ═══ IVFFlat indexes (created only if enough rows exist) ═══
-- issues already has 3+ vector columns from 011, create index if rows exist
DO $$
DECLARE
    n int;
BEGIN
    -- issues
    SELECT COUNT(*) INTO n FROM issues WHERE embedding IS NOT NULL;
    IF n >= 10 THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_issues_embedding ON issues USING ivfflat (embedding vector_cosine_ops) WITH (lists = ' || GREATEST(n / 1000, 10) || ')';
        RAISE NOTICE 'Created idx_issues_embedding (% rows, lists=%)', n, GREATEST(n / 1000, 10);
    ELSE
        RAISE NOTICE 'Skipped idx_issues_embedding (< 10 rows with embeddings)';
    END IF;

    -- knowledge_pages
    SELECT COUNT(*) INTO n FROM knowledge_pages WHERE embedding IS NOT NULL;
    IF n >= 10 THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_kp_embedding ON knowledge_pages USING ivfflat (embedding vector_cosine_ops) WITH (lists = ' || GREATEST(n / 1000, 10) || ')';
        RAISE NOTICE 'Created idx_kp_embedding (% rows, lists=%)', n, GREATEST(n / 1000, 10);
    ELSE
        RAISE NOTICE 'Skipped idx_kp_embedding (< 10 rows with embeddings)';
    END IF;

    -- projects (new column, likely empty)
    SELECT COUNT(*) INTO n FROM projects WHERE embedding IS NOT NULL;
    IF n >= 10 THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_projects_embedding ON projects USING ivfflat (embedding vector_cosine_ops) WITH (lists = ' || GREATEST(n / 1000, 10) || ')';
        RAISE NOTICE 'Created idx_projects_embedding (% rows, lists=%)', n, GREATEST(n / 1000, 10);
    ELSE
        RAISE NOTICE 'Skipped idx_projects_embedding (< 10 rows with embeddings)';
    END IF;

    -- comments (new column, likely empty)
    SELECT COUNT(*) INTO n FROM comments WHERE embedding IS NOT NULL;
    IF n >= 10 THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_comments_embedding ON comments USING ivfflat (embedding vector_cosine_ops) WITH (lists = ' || GREATEST(n / 1000, 10) || ')';
        RAISE NOTICE 'Created idx_comments_embedding (% rows, lists=%)', n, GREATEST(n / 1000, 10);
    ELSE
        RAISE NOTICE 'Skipped idx_comments_embedding (< 10 rows with embeddings)';
    END IF;

    -- ai_memory_chronicles (legacy 768d column — never populated, but if it ever is)
    SELECT COUNT(*) INTO n FROM ai_memory_chronicles WHERE embedding IS NOT NULL;
    IF n >= 10 THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_chronicles_embedding ON ai_memory_chronicles USING ivfflat (embedding vector_cosine_ops) WITH (lists = ' || GREATEST(n / 1000, 10) || ')';
        RAISE NOTICE 'Created idx_chronicles_embedding (% rows, lists=%)', n, GREATEST(n / 1000, 10);
    END IF;
END $$;

-- ═══ Rebuild indexes periodically as data grows ═══
-- Recommended: run every 10k new embedded rows:
--   DROP INDEX IF EXISTS idx_issues_embedding;
--   CREATE INDEX idx_issues_embedding ON issues USING ivfflat (embedding vector_cosine_ops) WITH (lists = new_n/1000);
