-- Migration: 014_reports
-- Description: AI-generated reports table — personal reports with draft/sent workflow
-- ROLLBACK: DROP TABLE IF EXISTS reports CASCADE;

CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    generated_by VARCHAR(36) NOT NULL,

    -- Scope: single project (NOT NULL) or cross-project summary (NULL)
    project_id VARCHAR(36),

    -- Type
    report_type VARCHAR(20) NOT NULL,    -- daily | weekly | monthly | sprint_review | custom

    -- Content
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,               -- Markdown (user-edited final version)
    original_content TEXT,               -- Markdown (AI original, for AI Review comparison)

    -- Generation context (for re-generation / AI Review data)
    context JSONB DEFAULT '{}',          -- {custom_prompt, aggregated_data, lang, attachments, sprint_id, ...}

    -- Status & metadata
    status VARCHAR(20) DEFAULT 'draft',  -- draft | sent
    generated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Send record (written after send)
    sent_to JSONB DEFAULT '[]',          -- [{userId, method: 'email'|'in_app', address?, sent_at}]
    dismissed_by JSONB DEFAULT '[]',     -- user IDs who hid this shared report
    sent_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_tenant_user ON reports (tenant_id, generated_by);
CREATE INDEX IF NOT EXISTS idx_reports_tenant_user_status ON reports (tenant_id, generated_by, status);
CREATE INDEX IF NOT EXISTS idx_reports_tenant_type ON reports (tenant_id, report_type);
CREATE INDEX IF NOT EXISTS idx_reports_project ON reports (project_id) WHERE project_id IS NOT NULL;
