-- Migration: 027_ai_consolidated_cognitions
-- Description: High-level project cognitions distilled from chronicle patterns (nightly reflection)
-- ROLLBACK: DROP TABLE IF EXISTS ai_consolidated_cognitions CASCADE;

CREATE TABLE IF NOT EXISTS ai_consolidated_cognitions (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) NOT NULL,
    cognition_type VARCHAR(32) NOT NULL,     -- PATTERN / TECH_DEBT / TEAM_INSIGHT / RISK_PATTERN
    cognition_summary TEXT NOT NULL,         -- distilled insight text
    source_event_ids TEXT[],                 -- chronicle IDs that spawned this cognition
    embedding vector(1024),                  -- bge-m3 default 1024-dim, cosine similarity
    confidence_score NUMERIC(3,2) DEFAULT 0.5,
    hit_count INT DEFAULT 1,                 -- validated/confirmed count
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cosine similarity index for dedup + retrieval
CREATE INDEX IF NOT EXISTS idx_cognitions_embedding
    ON ai_consolidated_cognitions USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_cognitions_project ON ai_consolidated_cognitions (tenant_id, project_id);

ALTER TABLE ai_consolidated_cognitions ENABLE ROW LEVEL SECURITY;
