-- ═══ Portfolio Sync Cabin — AI-aggregated full-panorama meeting cabin ═══
-- Design: docs/45-ai-portfolio-sync-cabin.md

CREATE TABLE IF NOT EXISTS portfolio_cabins (
    id VARCHAR(36) PRIMARY KEY, tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL, description TEXT,
    created_by VARCHAR(36) NOT NULL, status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ,
    CONSTRAINT portfolio_cabins_tenant_id_unique UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cabins_tenant ON portfolio_cabins(tenant_id, status);

CREATE TABLE IF NOT EXISTS cabin_participants (
    id VARCHAR(36) PRIMARY KEY, cabin_id VARCHAR(36) NOT NULL REFERENCES portfolio_cabins(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL, invited_by VARCHAR(36) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', invited_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cabin_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_participants_cabin ON cabin_participants(cabin_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON cabin_participants(user_id);

CREATE TABLE IF NOT EXISTS cabin_entries (
    id VARCHAR(36) PRIMARY KEY, tenant_id VARCHAR(36) NOT NULL,
    cabin_id VARCHAR(36) NOT NULL, project_id VARCHAR(36) NOT NULL,
    phase VARCHAR(50), attached_by VARCHAR(36) NOT NULL,
    attached_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cabin_id, project_id),
    CONSTRAINT fk_cabin_tenant_security FOREIGN KEY (tenant_id, cabin_id)
        REFERENCES portfolio_cabins(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_entries_perf_cover ON cabin_entries(cabin_id, project_id, phase);

CREATE TABLE IF NOT EXISTS cabin_documents (
    id VARCHAR(36) PRIMARY KEY, cabin_id VARCHAR(36) NOT NULL REFERENCES portfolio_cabins(id) ON DELETE CASCADE,
    content TEXT NOT NULL, health_data JSONB, dependency_data JSONB, summary_data JSONB,
    generated_at TIMESTAMPTZ DEFAULT NOW(), version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_docs_cabin ON cabin_documents(cabin_id, version DESC);

-- 5. Participant role (refinement)
ALTER TABLE cabin_participants ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'participant';

-- 6. Cabin Feedback
CREATE TABLE IF NOT EXISTS cabin_feedback (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES cabin_documents(id) ON DELETE CASCADE,
    cabin_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36),
    user_id VARCHAR(36) NOT NULL,
    feedback TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_doc ON cabin_feedback(document_id);
CREATE INDEX IF NOT EXISTS idx_feedback_cabin ON cabin_feedback(cabin_id);
