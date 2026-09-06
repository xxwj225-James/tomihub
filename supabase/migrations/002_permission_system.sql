-- ==========================================
-- Migration: 20260606000002_permission_system
-- Description: Three-tier permission system (Global → Project → Issue Security)
-- ROLLBACK: DROP TABLE IF EXISTS role_permissions, project_member_roles, tenant_member_roles,
--            issue_security_members, issue_security_levels, roles, permissions CASCADE;
--            ALTER TABLE tenant_members DROP COLUMN IF EXISTS role_id;
--            ALTER TABLE project_members DROP COLUMN IF EXISTS role_id;
--            ALTER TABLE issues DROP COLUMN IF EXISTS security_level_id;
-- ==========================================

-- ═══ Permission dictionary table ═══
CREATE TABLE IF NOT EXISTS permissions (
    code VARCHAR(50) PRIMARY KEY,
    category VARCHAR(20) NOT NULL CHECK (category IN ('GLOBAL','PROJECT')),
    description VARCHAR(255) NOT NULL,
    resource_type VARCHAR(50),
    is_dangerous BOOLEAN DEFAULT FALSE
);

-- ═══ Role definitions table ═══
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(36) PRIMARY KEY ,
    tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('global','project')),
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- ═══ Role-permission mapping ═══
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id VARCHAR(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code VARCHAR(50) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);

-- ═══ Tenant-level role assignment (multi-role support) ═══
CREATE TABLE IF NOT EXISTS tenant_member_roles (
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    role_id VARCHAR(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by VARCHAR(36) REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id, role_id)
);

-- ═══ Project-level role assignment (multi-role support) ═══
CREATE TABLE IF NOT EXISTS project_member_roles (
    project_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    role_id VARCHAR(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by VARCHAR(36) REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id, role_id)
);

-- ═══ Issue security levels ═══
CREATE TABLE IF NOT EXISTS issue_security_levels (
    id VARCHAR(36) PRIMARY KEY ,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    rank INT NOT NULL DEFAULT 0,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, name)
);

-- ═══ Issue security level members ═══
CREATE TABLE IF NOT EXISTS issue_security_members (
    id VARCHAR(36) PRIMARY KEY ,
    security_level_id VARCHAR(36) NOT NULL REFERENCES issue_security_levels(id) ON DELETE CASCADE,
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
    role_id VARCHAR(36) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT chk_security_member CHECK (user_id IS NOT NULL OR role_id IS NOT NULL),
    UNIQUE(security_level_id, user_id, role_id)
);

-- ═══ Issue table extension: security level ═══
ALTER TABLE issues ADD COLUMN IF NOT EXISTS security_level_id VARCHAR(36)
    REFERENCES issue_security_levels(id);

-- ═══ Indexes ═══
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tmr_user ON tenant_member_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_pmr_user ON project_member_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_ism_user ON issue_security_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ism_role ON issue_security_members(role_id);

-- ═══ Seed data: permission codes ═══
INSERT INTO permissions (code, category, description, resource_type, is_dangerous) VALUES
('GLOBAL:ADMIN',             'GLOBAL', '租户管理',               'tenant',   true),
('GLOBAL:CREATE_PROJECT',    'GLOBAL', '创建项目',               'project',  false),
('GLOBAL:MANAGE_USERS',      'GLOBAL', '管理租户成员',            'tenant',   true),
('GLOBAL:MANAGE_WORKFLOWS',  'GLOBAL', '管理工作流模板',           'workflow', false),
('GLOBAL:MANAGE_API_KEYS',   'GLOBAL', '管理API Key',            'apikey',   true),
('GLOBAL:VIEW_AUDIT_LOGS',   'GLOBAL', '查看审计日志',            'audit',    false),
('GLOBAL:BROWSE_USERS',      'GLOBAL', '浏览成员列表',            'user',     false),
('PROJECT:ADMIN',            'PROJECT', '项目管理',               'project',  true),
('PROJECT:BROWSE',           'PROJECT', '浏览项目',               'project',  false),
('PROJECT:CREATE_ISSUES',    'PROJECT', '创建Issue',             'issue',    false),
('PROJECT:EDIT_ISSUES',      'PROJECT', '编辑Issue',             'issue',    false),
('PROJECT:EDIT_OWN_ISSUES',  'PROJECT', '编辑自己的Issue',        'issue',    false),
('PROJECT:DELETE_ISSUES',    'PROJECT', '删除Issue',             'issue',    true),
('PROJECT:DELETE_OWN_ISSUES','PROJECT', '删除自己的Issue',        'issue',    false),
('PROJECT:ASSIGN_ISSUES',    'PROJECT', '分配Issue',             'issue',    false),
('PROJECT:RESOLVE_ISSUES',   'PROJECT', '解决Issue',             'issue',    false),
('PROJECT:COMMENT',          'PROJECT', '添加评论',               'comment',  false),
('PROJECT:DELETE_COMMENTS',  'PROJECT', '删除评论',               'comment',  true),
('PROJECT:DELETE_OWN_COMMENTS','PROJECT', '删除自己的评论',        'comment',  false),
('PROJECT:MANAGE_SPRINTS',   'PROJECT', '管理Sprint',            'sprint',   false),
('PROJECT:MANAGE_BOARD',     'PROJECT', '配置看板',               'board',    false),
('PROJECT:MANAGE_WORKFLOW',  'PROJECT', '配置工作流',             'workflow', false),
('PROJECT:VIEW_REPORTS',     'PROJECT', '查看报告',               'report',   false),
('PROJECT:VIEW_AI_ANALYSIS', 'PROJECT', '查看AI分析',             'ai',       false),
('PROJECT:SET_SECURITY_LEVEL','PROJECT', '设置安全级别',           'issue',    true)
ON CONFLICT (code) DO NOTHING;
