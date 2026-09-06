-- Migration: 011_vector_search
-- Description: Add embedding columns + indexes for semantic search
-- ROLLBACK: ALTER TABLE issues DROP COLUMN IF EXISTS embedding; ALTER TABLE knowledge_pages DROP COLUMN IF EXISTS embedding;

-- bge-m3 produces 1024-dimensional embeddings
ALTER TABLE issues ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE knowledge_pages ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- IVFFlat indexes for fast approximate nearest neighbor search
-- Wait until enough rows exist before creating (at least 10 for lists=1)
-- CREATE INDEX IF NOT EXISTS idx_issues_embedding ON issues USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1);
-- CREATE INDEX IF NOT EXISTS idx_kp_embedding ON knowledge_pages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1);
