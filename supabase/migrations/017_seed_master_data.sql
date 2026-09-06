-- Migration: 017_seed_master_data
-- Description: Seed master data — roles, permissions, issue types, workflows, notification triggers, enumerations
-- Must run AFTER 002 (permissions) and 010 (notifications)
-- ROLLBACK: DELETE FROM role_permissions; DELETE FROM roles; DELETE FROM issue_types; DELETE FROM workflows; DROP TABLE IF EXISTS master_data;

-- ═══ System Template Tenant (FK target for seed roles/types/workflows) ═══
INSERT INTO tenants (id, name, slug, plan, registration_mode, is_active) VALUES
    ('00000000-0000-0000-0000-000000000000', 'System Template', 'system-template', 'free', 'closed', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ═══ Schema fixes — DEFAULT on PK columns (missing in original migrations) ═══
ALTER TABLE roles ALTER COLUMN id SET DEFAULT gen_random_uuid()::VARCHAR;
ALTER TABLE issue_types ALTER COLUMN id SET DEFAULT gen_random_uuid()::VARCHAR;
ALTER TABLE workflows ALTER COLUMN id SET DEFAULT gen_random_uuid()::VARCHAR;

-- ═══ system_configs schema fix — add id PK + tenant_id for core module compatibility ═══
ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS id VARCHAR(36);
ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
UPDATE system_configs SET id = gen_random_uuid()::VARCHAR WHERE id IS NULL;
ALTER TABLE system_configs DROP CONSTRAINT IF EXISTS system_configs_pkey;
ALTER TABLE system_configs ADD PRIMARY KEY (id);
ALTER TABLE system_configs ADD CONSTRAINT uq_system_configs_tenant_key UNIQUE(tenant_id, key);
ALTER TABLE system_configs ADD CONSTRAINT uq_system_configs_key UNIQUE(key);

-- ═══ llm_config table (was missing entirely — blocked all AI features) ═══
CREATE TABLE IF NOT EXISTS llm_config (
    tenant_id VARCHAR(36) PRIMARY KEY,
    backend VARCHAR(20) NOT NULL DEFAULT 'ollama',
    ollama_base_url VARCHAR(255) DEFAULT 'http://ollama-embed:11434',
    ollama_flash_model VARCHAR(100),
    ollama_pro_model VARCHAR(100),
    embedding_model VARCHAR(100) DEFAULT 'bge-m3',
    cloud_provider VARCHAR(50),
    cloud_base_url VARCHAR(255),
    cloud_api_key TEXT,
    cloud_flash_model VARCHAR(100),
    cloud_pro_model VARCHAR(100),
    flash_timeout INT DEFAULT 120,
    pro_timeout INT DEFAULT 300,
    embedding_timeout INT DEFAULT 60,
    service_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ notification_triggers table (was missing entirely) ═══
CREATE TABLE IF NOT EXISTS notification_triggers (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    trigger_key VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, trigger_key)
);

-- ═══ Master Data Enum Table ═══
CREATE TABLE IF NOT EXISTS master_data (
    category VARCHAR(50) NOT NULL,
    key VARCHAR(50) NOT NULL,
    value VARCHAR(100),
    icon VARCHAR(50),
    color VARCHAR(7),
    sort_order INT DEFAULT 0,
    PRIMARY KEY (category, key)
);

-- ═══ Project Statuses ═══
INSERT INTO master_data (category, key, value, color, sort_order) VALUES
    ('project_status', 'active',   'Active',   '#10b981', 1),
    ('project_status', 'paused',   'Paused',   '#f59e0b', 2),
    ('project_status', 'archived', 'Archived', '#6b7280', 3),
    ('project_status', 'planning', 'Planning', '#6366f1', 0)
ON CONFLICT (category, key) DO NOTHING;

-- ═══ Project Phases ═══
INSERT INTO master_data (category, key, value, icon, color, sort_order) VALUES
    ('project_phase', 'initiation',   'Initiation',   '🚩', '#ef4444', 1),
    ('project_phase', 'planning',     'Planning',     '📋', '#f59e0b', 2),
    ('project_phase', 'development',  'Development',  '💻', '#6366f1', 3),
    ('project_phase', 'testing',      'Testing',      '🧪', '#8b5cf6', 4),
    ('project_phase', 'closure',      'Closure',      '✅', '#10b981', 5),
    ('project_phase', 'uat',          'UAT',          '👥', '#06b6d4', 6),
    ('project_phase', 'maintenance',  'Maintenance',  '🔧', '#6b7280', 7)
ON CONFLICT (category, key) DO NOTHING;

-- ═══ Issue Priorities ═══
INSERT INTO master_data (category, key, value, icon, color, sort_order) VALUES
    ('issue_priority', 'critical', 'Critical', '🔴', '#ef4444', 1),
    ('issue_priority', 'high',     'High',     '🟠', '#f59e0b', 2),
    ('issue_priority', 'medium',   'Medium',   '🟡', '#eab308', 3),
    ('issue_priority', 'low',      'Low',      '🟢', '#10b981', 4)
ON CONFLICT (category, key) DO NOTHING;

-- ═══ System Roles (scope=global) — workspace-level permissions ═══
-- Note: tenant_members.role (owner/admin/member/viewer) maps to these role definitions
INSERT INTO roles (tenant_id, name, description, scope, persona, is_system) VALUES
    ('00000000-0000-0000-0000-000000000000', 'Workspace Owner',  'Workspace creator — full control including deletion',              'global', 'pm',        TRUE),
    ('00000000-0000-0000-0000-000000000000', 'Workspace Admin',  'Manage members, settings, create projects — cannot delete workspace','global', 'pm',        TRUE),
    ('00000000-0000-0000-0000-000000000000', 'Workspace Member', 'Participate in projects — cannot manage workspace settings',        'global', 'viewer',    TRUE),
    ('00000000-0000-0000-0000-000000000000', 'Workspace Viewer', 'Read-only access to authorized projects',                          'global', 'viewer',    TRUE)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ═══ Project Roles (scope=project) — in-project permissions ═══
INSERT INTO roles (tenant_id, name, description, scope, persona, is_system) VALUES
    ('00000000-0000-0000-0000-000000000000', 'Project Owner',  'Project creator — ultimate authority, assign roles, delete project', 'project', 'pm', TRUE),
    ('00000000-0000-0000-0000-000000000000', 'Project Lead',   'Full project control — manage members, workflows, settings', 'project', 'pm',        TRUE),
    ('00000000-0000-0000-0000-000000000000', 'Developer',      'Write code, create/edit issues, comment',                     'project', 'developer', TRUE),
    ('00000000-0000-0000-0000-000000000000', 'QA Engineer',    'Test, report bugs, verify fixes',                             'project', 'qa',        TRUE),
    ('00000000-0000-0000-0000-000000000000', 'Viewer',          'Read-only access to project',                                 'project', 'viewer',    TRUE)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ═══ Role ↔ Permission mapping ═══

-- System: Workspace Owner — ALL permissions
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Workspace Owner' AND r.tenant_id = '00000000-0000-0000-0000-000000000000'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- System: Workspace Admin — everything except GLOBAL:ADMIN (cannot delete workspace)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Workspace Admin' AND r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND p.code != 'GLOBAL:ADMIN'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- System: Workspace Member — browse users + basic project permissions
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Workspace Member' AND r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND p.code IN ('GLOBAL:BROWSE_USERS', 'PROJECT:BROWSE')
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- System: Workspace Viewer — browse users only (project access determined by project role)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Workspace Viewer' AND r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND p.code IN ('GLOBAL:BROWSE_USERS')
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Project: Project Lead — full project control
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Project Lead' AND r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND p.code IN ('PROJECT:ADMIN', 'PROJECT:BROWSE',
                 'PROJECT:CREATE_ISSUES', 'PROJECT:EDIT_ISSUES', 'PROJECT:DELETE_ISSUES',
                 'PROJECT:EDIT_OWN_ISSUES', 'PROJECT:DELETE_OWN_ISSUES',
                 'PROJECT:ASSIGN_ISSUES', 'PROJECT:RESOLVE_ISSUES',
                 'PROJECT:COMMENT', 'PROJECT:DELETE_COMMENTS', 'PROJECT:DELETE_OWN_COMMENTS',
                 'PROJECT:MANAGE_SPRINTS', 'PROJECT:MANAGE_BOARD', 'PROJECT:MANAGE_WORKFLOW',
                 'PROJECT:VIEW_REPORTS', 'PROJECT:VIEW_AI_ANALYSIS', 'PROJECT:SET_SECURITY_LEVEL')
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Project: Developer — create, edit, comment (cannot delete others', cannot manage project)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Developer' AND r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND p.code IN ('PROJECT:BROWSE',
                 'PROJECT:CREATE_ISSUES', 'PROJECT:EDIT_ISSUES', 'PROJECT:EDIT_OWN_ISSUES',
                 'PROJECT:DELETE_OWN_ISSUES',
                 'PROJECT:ASSIGN_ISSUES', 'PROJECT:RESOLVE_ISSUES',
                 'PROJECT:COMMENT', 'PROJECT:DELETE_OWN_COMMENTS',
                 'PROJECT:VIEW_REPORTS', 'PROJECT:VIEW_AI_ANALYSIS')
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Project: QA Engineer — create issues (report bugs), comment, view
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
WHERE r.name = 'QA Engineer' AND r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND p.code IN ('PROJECT:BROWSE',
                 'PROJECT:CREATE_ISSUES',
                 'PROJECT:COMMENT', 'PROJECT:DELETE_OWN_COMMENTS',
                 'PROJECT:VIEW_REPORTS', 'PROJECT:VIEW_AI_ANALYSIS')
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Project: Viewer — read-only
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Viewer' AND r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND p.code IN ('PROJECT:BROWSE', 'PROJECT:VIEW_REPORTS', 'PROJECT:VIEW_AI_ANALYSIS')
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- ═══ Issue Types (per-tenant, seed system defaults for new tenants) ═══
-- Note: these use tenant_id '00000000...' as system template. New tenants copy from here.
ALTER TABLE issue_types ADD CONSTRAINT uq_issue_types_tenant_name UNIQUE(tenant_id, name);
INSERT INTO issue_types (tenant_id, name, icon, color, hierarchy_level) VALUES
    ('00000000-0000-0000-0000-000000000000', 'Bug',       '🐛', '#ef4444', 0),
    ('00000000-0000-0000-0000-000000000000', 'Task',      '📋', '#6366f1', 1),
    ('00000000-0000-0000-0000-000000000000', 'Feature',   '✨', '#8b5cf6', 2),
    ('00000000-0000-0000-0000-000000000000', 'Improvement','🔧', '#f59e0b', 1),
    ('00000000-0000-0000-0000-000000000000', 'Epic',      '🏔', '#06b6d4', 3),
    ('00000000-0000-0000-0000-000000000000', 'Story',     '📖', '#10b981', 2)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ═══ Issue Statuses ═══
INSERT INTO master_data (category, key, value, icon, color, sort_order) VALUES
    ('issue_status', 'backlog',           'Backlog',          '📥', '#6b7280', 1),
    ('issue_status', 'todo',              'Todo',             '📌', '#6366f1', 2),
    ('issue_status', 'in_progress',       'In Progress',      '🔄', '#f59e0b', 3),
    ('issue_status', 'in_review',         'In Review',        '👁', '#8b5cf6', 4),
    ('issue_status', 'done',              'Done',             '✅', '#10b981', 5),
    ('issue_status', 'cancelled',         'Cancelled',        '❌', '#ef4444', 6),
    ('issue_status', 'product_backlog',   'Product Backlog',  '📦', '#06b6d4', 7),
    ('issue_status', 'sprint_backlog',    'Sprint Backlog',   '🏃', '#06b6d4', 8),
    ('issue_status', 'requirements',      'Requirements',     '📝', '#3b82f6', 9),
    ('issue_status', 'design',            'Design',           '🎨', '#a855f7', 10),
    ('issue_status', 'implementation',    'Implementation',   '💻', '#f59e0b', 11),
    ('issue_status', 'testing',           'Testing',          '🧪', '#8b5cf6', 12),
    ('issue_status', 'deployment',        'Deployment',       '🚀', '#10b981', 13),
    ('issue_status', 'maintenance',       'Maintenance',      '🔧', '#6b7280', 14)
ON CONFLICT (category, key) DO NOTHING;

-- ═══ Project Methodologies ═══
CREATE TABLE IF NOT EXISTS project_methodologies (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
    tenant_id VARCHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    name VARCHAR(50) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    UNIQUE(tenant_id, name)
);

INSERT INTO project_methodologies (tenant_id, name, description, icon, is_default, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000000', 'Kanban',  'Continuous flow — visualize work, limit WIP, maximize throughput',     '📋', TRUE,  1),
    ('00000000-0000-0000-0000-000000000000', 'Scrum',   'Time-boxed sprints — plan, execute, review, retrospect',              '🔄', FALSE, 2),
    ('00000000-0000-0000-0000-000000000000', 'Waterfall','Sequential phases — requirements → design → implement → test → deploy','🌊', FALSE, 3)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ═══ Add methodology_id to workflows ═══
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS methodology_id VARCHAR(36) REFERENCES project_methodologies(id);
ALTER TABLE workflows ADD CONSTRAINT uq_workflows_tenant_name UNIQUE(tenant_id, name);

-- ═══ Workflows (one per methodology) ═══
INSERT INTO workflows (tenant_id, name, description, states, transitions, is_default, methodology_id) VALUES
    ('00000000-0000-0000-0000-000000000000', 'Kanban Default',
     'Kanban: Backlog → Todo → In Progress → In Review → Done',
     '["Backlog","Todo","In Progress","In Review","Done","Cancelled"]',
     '[{"from":"Backlog","to":"Todo"},{"from":"Todo","to":"In Progress"},{"from":"In Progress","to":"In Review"},{"from":"In Review","to":"Done"},{"from":"In Progress","to":"Todo"},{"from":"In Review","to":"In Progress"},{"from":"Todo","to":"Cancelled"},{"from":"In Progress","to":"Cancelled"}]',
     TRUE,
     (SELECT id FROM project_methodologies WHERE name='Kanban' AND tenant_id='00000000-0000-0000-0000-000000000000'))
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO workflows (tenant_id, name, description, states, transitions, is_default, methodology_id) VALUES
    ('00000000-0000-0000-0000-000000000000', 'Scrum Default',
     'Scrum: Product Backlog → Sprint Backlog → In Progress → Review → Done',
     '["Product Backlog","Sprint Backlog","In Progress","In Review","Done","Cancelled"]',
     '[{"from":"Product Backlog","to":"Sprint Backlog"},{"from":"Sprint Backlog","to":"In Progress"},{"from":"In Progress","to":"In Review"},{"from":"In Review","to":"Done"},{"from":"In Progress","to":"Sprint Backlog"},{"from":"In Review","to":"In Progress"},{"from":"Sprint Backlog","to":"Cancelled"},{"from":"In Progress","to":"Cancelled"}]',
     TRUE,
     (SELECT id FROM project_methodologies WHERE name='Scrum' AND tenant_id='00000000-0000-0000-0000-000000000000'))
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO workflows (tenant_id, name, description, states, transitions, is_default, methodology_id) VALUES
    ('00000000-0000-0000-0000-000000000000', 'Waterfall Default',
     'Waterfall: Requirements → Design → Implementation → Testing → Deployment → Maintenance',
     '["Requirements","Design","Implementation","Testing","Deployment","Maintenance","Cancelled"]',
     '[{"from":"Requirements","to":"Design"},{"from":"Design","to":"Implementation"},{"from":"Implementation","to":"Testing"},{"from":"Testing","to":"Deployment"},{"from":"Deployment","to":"Maintenance"},{"from":"Design","to":"Requirements"},{"from":"Implementation","to":"Design"},{"from":"Testing","to":"Implementation"}]',
     TRUE,
     (SELECT id FROM project_methodologies WHERE name='Waterfall' AND tenant_id='00000000-0000-0000-0000-000000000000'))
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ═══ AI Model options ═══
INSERT INTO master_data (category, key, value, sort_order) VALUES
    ('ai_timeout', '60',  '60',  1),
    ('ai_timeout', '120', '120', 2),
    ('ai_timeout', '180', '180', 3),
    ('ai_timeout', '300', '300', 4),
    ('ai_timeout', '600', '600', 5)
ON CONFLICT (category, key) DO NOTHING;

INSERT INTO master_data (category, key, value, sort_order) VALUES
    ('ai_ollama_model', 'deepseek-r1:1.5b',    'DeepSeek R1 1.5B',    1),
    ('ai_ollama_model', 'deepseek-r1:7b',       'DeepSeek R1 7B',      2),
    ('ai_ollama_model', 'deepseek-r1:14b',      'DeepSeek R1 14B',     3),
    ('ai_ollama_model', 'deepseek-coder:6.7b',  'DeepSeek Coder 6.7B', 4),
    ('ai_ollama_model', 'qwen2.5:7b',           'Qwen 2.5 7B',          5),
    ('ai_ollama_model', 'qwen2.5:14b',          'Qwen 2.5 14B',         6),
    ('ai_ollama_model', 'llama3.2:3b',          'Llama 3.2 3B',         7),
    ('ai_ollama_model', 'llama3.2:8b',          'Llama 3.2 8B',         8),
    ('ai_ollama_model', 'codellama:7b',         'CodeLlama 7B',         9),
    ('ai_ollama_model', 'bge-m3',               'BGE-M3 (Embedding)',  10)
ON CONFLICT (category, key) DO NOTHING;

INSERT INTO master_data (category, key, value, sort_order) VALUES
    ('ai_cloud_model', 'deepseek-v4-flash',      'DeepSeek V4 Flash',    0),
    ('ai_cloud_model', 'deepseek-v4-pro',         'DeepSeek V4 Pro',      1),
    ('ai_cloud_model', 'deepseek-chat',          'DeepSeek Chat (V3)',   2),
    ('ai_cloud_model', 'deepseek-reasoner',       'DeepSeek R1',          3),
    ('ai_cloud_model', 'gpt-4o',                'GPT-4o',               4),
    ('ai_cloud_model', 'gpt-4o-mini',           'GPT-4o Mini',          5),
    ('ai_cloud_model', 'claude-sonnet-4-6',     'Claude Sonnet 4.6',    6),
    ('ai_cloud_model', 'claude-haiku-4-5',     'Claude Haiku 4.5',     7),
    ('ai_cloud_model', 'claude-opus-4-8',       'Claude Opus 4.8',      8)
ON CONFLICT (category, key) DO NOTHING;

-- ═══ Local Embedding Models (Ollama) ═══
INSERT INTO master_data (category, key, value, sort_order) VALUES
    ('ai_embedding_model', 'bge-m3',             'BGE-M3 (multilingual, 1024d)', 0),
    ('ai_embedding_model', 'nomic-embed-text',   'Nomic Embed Text (768d)',       1),
    ('ai_embedding_model', 'mxbai-embed-large',  'MXBAI Embed Large (1024d)',     2)
ON CONFLICT (category, key) DO NOTHING;

-- ═══ UI Language + AI Output Language options ═══
INSERT INTO master_data (category, key, value, icon, sort_order) VALUES
    ('ui_language', 'en', 'English', '🇺🇸', 1),
    ('ui_language', 'zh', '简体中文', '🇨🇳', 2),
    ('ui_language', 'ja', '日本語', '🇯🇵', 3),
    ('ai_language', 'en', 'English', '🇺🇸', 1),
    ('ai_language', 'zh', '简体中文', '🇨🇳', 2),
    ('ai_language', 'ja', '日本語', '🇯🇵', 3)
ON CONFLICT (category, key) DO NOTHING;

-- ═══ Skill Tags (dynamic — admin can extend via master_data) ═══
INSERT INTO master_data (category, key, value, color, sort_order) VALUES
    ('skill_tags', 'java',     'Java',         '#b07219',  1),
    ('skill_tags', 'python',   'Python',       '#3572A5',  2),
    ('skill_tags', 'react',    'React',        '#61dafb',  3),
    ('skill_tags', 'nodejs',   'Node.js',      '#339933',  4),
    ('skill_tags', 'typescript','TypeScript',  '#3178c6',  5),
    ('skill_tags', 'docker',   'Docker',       '#2496ed',  6),
    ('skill_tags', 'go',       'Go',           '#00ADD8',  7),
    ('skill_tags', 'kubernetes','Kubernetes',  '#326ce5',  8),
    ('skill_tags', 'aws',      'AWS',          '#FF9900',  9),
    ('skill_tags', 'flutter',  'Flutter',      '#02569B', 10),
    ('skill_tags', 'figma',    'Figma',        '#F24E1E', 11),
    ('skill_tags', 'sql',      'SQL',          '#336791', 12),
    ('skill_tags', 'mongodb',  'MongoDB',      '#47A248', 13),
    ('skill_tags', 'redis',    'Redis',        '#DC382D', 14),
    -- Management
    ('skill_tags', 'scrum',        'Scrum',         '#6b7280', 21),
    ('skill_tags', 'agile',        'Agile',         '#6b7280', 22),
    ('skill_tags', 'project_mgmt', 'Project Mgmt',  '#6b7280', 23),
    ('skill_tags', 'jira_admin',   'Jira Admin',    '#0052CC', 24),
    ('skill_tags', 'risk_mgmt',    'Risk Mgmt',     '#6b7280', 25),
    ('skill_tags', 'stakeholder',  'Stakeholder',   '#6b7280', 26),
    ('skill_tags', 'sprint_plan',  'Sprint Plan',   '#6b7280', 27),
    ('skill_tags', 'confluence',   'Confluence',    '#172B4D', 28),
    -- Testing
    ('skill_tags', 'selenium',     'Selenium',      '#43B02A', 31),
    ('skill_tags', 'junit',        'JUnit',         '#25A162', 32),
    ('skill_tags', 'postman',      'Postman',       '#FF6C37', 33),
    ('skill_tags', 'test_auto',    'Test Automation','#6b7280', 34),
    ('skill_tags', 'perf_test',    'Perf Testing',  '#6b7280', 35),
    ('skill_tags', 'manual_test',  'Manual Testing','#6b7280', 36),
    -- DevOps
    ('skill_tags', 'cicd',     'CI/CD',         '#6b7280', 41),
    ('skill_tags', 'jenkins',  'Jenkins',       '#D24939', 42),
    ('skill_tags', 'terraform','Terraform',     '#7B42BC', 43),
    ('skill_tags', 'ansible',  'Ansible',       '#EE0000', 44),
    ('skill_tags', 'linux',    'Linux',         '#FCC624', 45),
    -- Design & Product
    ('skill_tags', 'uiux',     'UI/UX',         '#FF61F6', 51),
    ('skill_tags', 'prototyping','Prototyping', '#6b7280', 52),
    ('skill_tags', 'prd',      'PRD',           '#6b7280', 53)
ON CONFLICT (category, key) DO NOTHING;

-- ═══ Notification Triggers (default: all enabled) ═══
INSERT INTO notification_triggers (id, tenant_id, trigger_key, enabled) VALUES
    (gen_random_uuid()::VARCHAR, '00000000-0000-0000-0000-000000000000', 'issue_assigned', TRUE),
    (gen_random_uuid()::VARCHAR, '00000000-0000-0000-0000-000000000000', 'phase_changed',  TRUE),
    (gen_random_uuid()::VARCHAR, '00000000-0000-0000-0000-000000000000', 'report_shared',  TRUE),
    (gen_random_uuid()::VARCHAR, '00000000-0000-0000-0000-000000000000', 'hitl_pending',   TRUE)
ON CONFLICT (tenant_id, trigger_key) DO NOTHING;
