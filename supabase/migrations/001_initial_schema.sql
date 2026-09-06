-- ==========================================
-- Migration: 20260606000001_initial_schema
-- Description: Initial database schema — all core tables
-- ★ DO NOT MODIFY this file after production deployment.
--    Create new incremental migration files instead.
--    See: supabase/migrations/README.md
-- ==========================================

-- ═══ Auth & Users ═══

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY ,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ═══ Email Verification Codes ═══

CREATE TABLE IF NOT EXISTS email_verifications (
    id VARCHAR(36) PRIMARY KEY ,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('register','login','reset_password')),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_ver_lookup ON email_verifications(email, purpose, created_at DESC);

-- ═══ Refresh Tokens ═══

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR(36) PRIMARY KEY ,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    device_name VARCHAR(255),
    device_info JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    replaced_by VARCHAR(36) REFERENCES refresh_tokens(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id, revoked);

-- ═══ Tenants ═══

CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(36) PRIMARY KEY ,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_members (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tm_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tm_tenant ON tenant_members(tenant_id);

-- ═══ API Keys ═══

CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(10) NOT NULL DEFAULT 'ai_pm_',
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]',
    resource_restrictions JSONB DEFAULT '{}',
    allowed_ips TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    use_count BIGINT DEFAULT 0,
    last_used_ip VARCHAR(45),
    revoked_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(36) NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_apikey_user ON api_keys(user_id) WHERE is_active = TRUE;

-- ═══ Projects ═══

CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key VARCHAR(10) NOT NULL,
    description TEXT,
    lead_id VARCHAR(36) REFERENCES users(id),
    visibility VARCHAR(20) DEFAULT 'private',
    status VARCHAR(20) DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);

CREATE TABLE IF NOT EXISTS project_members (
    id VARCHAR(36) PRIMARY KEY ,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- ═══ Workflows ═══

CREATE TABLE IF NOT EXISTS workflows (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    states JSONB NOT NULL,
    transitions JSONB NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issue_types (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(7),
    hierarchy_level INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ Issues (Core Table) ═══

CREATE TABLE IF NOT EXISTS issues (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_id VARCHAR(36) NOT NULL REFERENCES workflows(id),
    issue_number INT NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type_id VARCHAR(36) REFERENCES issue_types(id),
    type VARCHAR(20) DEFAULT 'task',
    status VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    severity VARCHAR(20),
    assignee_id VARCHAR(36) REFERENCES users(id),
    reporter_id VARCHAR(36) NOT NULL REFERENCES users(id),
    sprint_id VARCHAR(36),
    parent_id VARCHAR(36) REFERENCES issues(id),
    story_points DECIMAL(3,1),
    due_date DATE,
    started_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    sort_order INT DEFAULT 0,
    labels TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}',
    ai_tags TEXT[] DEFAULT '{}',
    ai_risk_score DECIMAL(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, issue_number)
);
CREATE INDEX IF NOT EXISTS idx_issues_tenant_proj ON issues(tenant_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_parent ON issues(parent_id);
CREATE INDEX IF NOT EXISTS idx_issues_sprint ON issues(sprint_id);

-- ═══ Issue Links ═══

CREATE TABLE IF NOT EXISTS issue_links (
    id VARCHAR(36) PRIMARY KEY ,
    source_id VARCHAR(36) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    target_id VARCHAR(36) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    link_type VARCHAR(20) NOT NULL,
    created_by VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_id, link_type)
);

-- ═══ Comments ═══

CREATE TABLE IF NOT EXISTS comments (
    id VARCHAR(36) PRIMARY KEY ,
    issue_id VARCHAR(36) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id VARCHAR(36) NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    ai_sentiment VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id, created_at);

-- ═══ Change Log ═══

CREATE TABLE IF NOT EXISTS issue_changelog (
    id VARCHAR(36),
    tenant_id VARCHAR(36) NOT NULL,
    issue_id VARCHAR(36) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    changed_by VARCHAR(36) NOT NULL REFERENCES users(id),
    field VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_changelog_created ON issue_changelog (created_at);
CREATE INDEX IF NOT EXISTS idx_changelog_issue ON issue_changelog (issue_id);

-- ═══ Boards ═══

CREATE TABLE IF NOT EXISTS boards (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'kanban',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS board_columns (
    id VARCHAR(36) PRIMARY KEY ,
    board_id VARCHAR(36) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    mapped_statuses TEXT[] NOT NULL,
    wip_limit INT,
    sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS board_cards (
    id VARCHAR(36) PRIMARY KEY ,
    board_id VARCHAR(36) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id VARCHAR(36) NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
    issue_id VARCHAR(36) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    position INT DEFAULT 0,
    UNIQUE(board_id, issue_id)
);
CREATE INDEX IF NOT EXISTS idx_board_cards_col ON board_cards(column_id, position);

-- ═══ Sprints ═══

CREATE TABLE IF NOT EXISTS sprints (
    id VARCHAR(36) PRIMARY KEY ,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    goal TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'planning',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ Milestones ═══

CREATE TABLE IF NOT EXISTS milestones (
    id VARCHAR(36) PRIMARY KEY ,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ Notifications ═══

-- (notifications table defined in 010_unified_notifications.sql)

-- ═══ Attachments ═══

CREATE TABLE IF NOT EXISTS attachments (
    id VARCHAR(36) PRIMARY KEY ,
    issue_id VARCHAR(36) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    uploader_id VARCHAR(36) NOT NULL REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    content_type VARCHAR(100),
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ AI Analysis Tasks ═══

CREATE TABLE IF NOT EXISTS ai_tasks (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    params JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    progress_percent INT DEFAULT 0,
    progress_message TEXT,
    worker_id VARCHAR(100),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    heartbeat_interval_seconds INT DEFAULT 30,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    last_error TEXT,
    result JSONB,
    result_summary TEXT,
    tokens_used INT,
    cost_estimate DECIMAL(10,6),
    triggered_by VARCHAR(36) REFERENCES users(id),
    trigger_source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_heartbeat ON ai_tasks(status, heartbeat_at) WHERE status = 'PROCESSING';
CREATE INDEX IF NOT EXISTS idx_ai_tasks_tenant ON ai_tasks(tenant_id, created_at DESC);

-- ═══ Audit Logs ═══

CREATE TABLE IF NOT EXISTS auth_audit_logs (
    id VARCHAR(36),
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON auth_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON auth_audit_logs (tenant_id, created_at DESC);

-- ═══ Row Level Security ═══

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
              'issues','comments','attachments','issue_links',
              'projects','project_members','sprints','milestones',
              'boards','board_columns','board_cards',
              'workflows','issue_types',
              'notifications','api_keys','refresh_tokens',
              'ai_tasks'
          )
    LOOP
        EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;
