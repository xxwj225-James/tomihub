-- Migration: 20260609000008_knowledge_base
-- Description: Knowledge Base / Wiki pages per project
-- ROLLBACK: DROP TABLE IF EXISTS knowledge_pages CASCADE;

CREATE TABLE IF NOT EXISTS knowledge_pages (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    category VARCHAR(50) DEFAULT 'general',
    status VARCHAR(20) DEFAULT 'draft',     -- draft | published | archived
    created_by VARCHAR(36) REFERENCES users(id),
    updated_by VARCHAR(36) REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_project ON knowledge_pages(project_id, category);
CREATE INDEX IF NOT EXISTS idx_kb_tenant ON knowledge_pages(tenant_id);
