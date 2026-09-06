# Master Table Database Design

> **Version**: v1.0
> **Date**: 2026-06-08
> **Category**: 6 categories · 22 tables

---

## 1. Category Overview

```
Category                              Tables                      Description
──────────────────────────────────────  ────────────────────────────  ────────────────────────────────────
A. Authentication & Identity          users, email_verifications, User registration/login/Token
                                      refresh_tokens, api_keys

B. Tenants & Members                  tenants, tenant_members     SaaS multi-tenant isolation

C. Permissions & Roles                permissions, roles,         Three-tier permission system
                                      role_permissions,           Global → Project → Issue Security
                                      tenant_member_roles,
                                      project_member_roles

D. Projects & Workflow Configuration  projects, project_members,  Projects/members/workflows
                                      workflows, issue_types

E. Security Levels                    issue_security_levels,      Issue-level confidentiality control
                                      issue_security_members

F. System & Audit                     notifications, ai_tasks,    Notifications/AI tasks/audit logs
                                      auth_audit_logs
```

---

## 2. Category A — Authentication & Identity

### 2.1 users

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- login credentials
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- personal info
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    
    -- status
    email_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',    -- active | disabled | suspended
    
    -- security
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(45),
    
    -- timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
```

| Field | Type | Description |
|------|------|------|
| `id` | UUID | Primary key |
| `email` | VARCHAR(255) | Globally unique email |
| `password_hash` | VARCHAR(255) | BCrypt hash |
| `status` | VARCHAR(20) | active / disabled / suspended |
| `failed_login_attempts` | INT | Consecutive failures; lock triggers at ≥5 |
| `locked_until` | TIMESTAMPTZ | Lock expiry time |

### 2.2 email_verifications

```sql
CREATE TABLE email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(20) NOT NULL,            -- register | login | reset_password
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_ver_lookup ON email_verifications(email, purpose, created_at DESC);
```

### 2.3 refresh_tokens

```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL, -- SHA-256 of raw token
    device_name VARCHAR(255),
    device_info JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    replaced_by UUID REFERENCES refresh_tokens(id),  -- token rotation tracking
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_user ON refresh_tokens(user_id, revoked);
CREATE INDEX idx_refresh_hash ON refresh_tokens(token_hash);
```

### 2.4 api_keys

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,              -- user-defined label, e.g. "VSCode MacBook"
    key_prefix VARCHAR(10) NOT NULL DEFAULT 'ai_pm_',
    key_hash VARCHAR(255) UNIQUE NOT NULL,   -- SHA-256
    scopes JSONB NOT NULL DEFAULT '[]',      -- ["issue:read","issue:comment"]
    resource_restrictions JSONB DEFAULT '{}',-- {"project_ids":["p1"]}
    allowed_ips TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL,         -- max 90 days
    last_used_at TIMESTAMPTZ,
    use_count BIGINT DEFAULT 0,
    last_used_ip VARCHAR(45),
    revoked_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_apikey_user ON api_keys(user_id) WHERE is_active = TRUE;
```

---

## 3. Category B — Tenants & Members

### 3.1 tenants

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,       -- URL-friendly identifier
    logo_url TEXT,
    plan VARCHAR(50) DEFAULT 'free',         -- free | pro | enterprise
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 tenant_members

```sql
CREATE TABLE tenant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- owner | admin | member | viewer
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tm_user ON tenant_members(user_id);
CREATE INDEX idx_tm_tenant ON tenant_members(tenant_id);
```

---

## 4. Category C — Permissions & Roles

### 4.1 permissions (permission-code dictionary)

```sql
CREATE TABLE permissions (
    code VARCHAR(50) PRIMARY KEY,            -- GLOBAL:ADMIN, PROJECT:BROWSE, etc.
    category VARCHAR(20) NOT NULL CHECK (category IN ('GLOBAL', 'PROJECT')),
    description VARCHAR(255) NOT NULL,
    resource_type VARCHAR(50),               -- tenant | project | issue | board | sprint
    is_dangerous BOOLEAN DEFAULT FALSE       -- dangerous permissions need extra audit
);
```

Seed data — 25 permission codes:

| code | category | description |
|------|----------|-------------|
| `GLOBAL:ADMIN` | GLOBAL | Tenant administration |
| `GLOBAL:CREATE_PROJECT` | GLOBAL | Create projects |
| `GLOBAL:MANAGE_USERS` | GLOBAL | Manage tenant members |
| `GLOBAL:MANAGE_WORKFLOWS` | GLOBAL | Manage workflow templates |
| `GLOBAL:MANAGE_API_KEYS` | GLOBAL | Manage API keys |
| `GLOBAL:VIEW_AUDIT_LOGS` | GLOBAL | View audit logs |
| `GLOBAL:BROWSE_USERS` | GLOBAL | Browse member list |
| `PROJECT:ADMIN` | PROJECT | Project administration |
| `PROJECT:BROWSE` | PROJECT | Browse projects |
| `PROJECT:CREATE_ISSUES` | PROJECT | Create issues |
| `PROJECT:EDIT_ISSUES` | PROJECT | Edit issues |
| `PROJECT:EDIT_OWN_ISSUES` | PROJECT | Edit own issues |
| `PROJECT:DELETE_ISSUES` | PROJECT | Delete issues |
| `PROJECT:DELETE_OWN_ISSUES` | PROJECT | Delete own issues |
| `PROJECT:ASSIGN_ISSUES` | PROJECT | Assign issues |
| `PROJECT:RESOLVE_ISSUES` | PROJECT | Resolve issues |
| `PROJECT:COMMENT` | PROJECT | Add comments |
| `PROJECT:DELETE_COMMENTS` | PROJECT | Delete comments |
| `PROJECT:DELETE_OWN_COMMENTS` | PROJECT | Delete own comments |
| `PROJECT:MANAGE_SPRINTS` | PROJECT | Manage sprints |
| `PROJECT:MANAGE_BOARD` | PROJECT | Configure board |
| `PROJECT:MANAGE_WORKFLOW` | PROJECT | Configure workflow |
| `PROJECT:VIEW_REPORTS` | PROJECT | View reports |
| `PROJECT:VIEW_AI_ANALYSIS` | PROJECT | View AI analysis |
| `PROJECT:SET_SECURITY_LEVEL` | PROJECT | Set security level |

### 4.2 roles (role definitions)

```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('global', 'project')),
    is_system BOOLEAN DEFAULT FALSE,         -- built-in roles cannot be deleted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);
```

System-preset roles:

| Role | scope | Permission codes |
|------|-------|--------|
| Tenant Owner | global | All GLOBAL permissions (hardcoded bypass) |
| Tenant Admin | global | GLOBAL:ADMIN, CREATE_PROJECT, MANAGE_USERS, MANAGE_API_KEYS, VIEW_AUDIT_LOGS |
| Tenant Member | global | GLOBAL:BROWSE_USERS, CREATE_PROJECT |
| Tenant Viewer | global | GLOBAL:BROWSE_USERS |
| Project Lead | project | All PROJECT permissions |
| Developer | project | BROWSE, CREATE_ISSUES, EDIT_OWN_ISSUES, ASSIGN, RESOLVE, COMMENT, DELETE_OWN_COMMENTS, VIEW_REPORTS, VIEW_AI_ANALYSIS |
| Reviewer | project | BROWSE, COMMENT, DELETE_OWN_COMMENTS, VIEW_REPORTS |
| Viewer | project | BROWSE, VIEW_REPORTS |

### 4.3 role_permissions

```sql
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code VARCHAR(50) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);
```

### 4.4 tenant_member_roles

```sql
CREATE TABLE tenant_member_roles (
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id, role_id)
);
```

### 4.5 project_member_roles

```sql
CREATE TABLE project_member_roles (
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id, role_id)
);

CREATE INDEX idx_pmr_user ON project_member_roles(user_id);
```

---

## 5. Category D — Projects & Workflow Configuration

### 5.1 projects

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key VARCHAR(10) NOT NULL,                -- Project Key: "AIPM", "MOB"
    description TEXT,
    lead_id UUID REFERENCES users(id),
    visibility VARCHAR(20) DEFAULT 'private',-- private | internal | public
    status VARCHAR(20) DEFAULT 'active',     -- active | archived | completed
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, key)
);

CREATE INDEX idx_projects_tenant ON projects(tenant_id);
```

### 5.2 project_members

```sql
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- lead | developer | reviewer | viewer
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);
```

### 5.3 workflows

```sql
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    states JSONB NOT NULL,                   -- [{"key":"open","name":"To Do","category":"todo"},...]
    transitions JSONB NOT NULL,              -- [{"from":"open","to":"in_progress","name":"Start","conditions":[],"validators":[]},...]
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.4 issue_types

```sql
CREATE TABLE issue_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,               -- Bug | Task | Story | Epic | Sub-task
    icon VARCHAR(50),
    color VARCHAR(7),                        -- hex color for badge display
    hierarchy_level INT DEFAULT 0,           -- 0=Epic, 1=Story, 2=Task/Bug, 3=Sub-task
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. Category E — Security Levels

### 6.1 issue_security_levels

```sql
CREATE TABLE issue_security_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,              -- e.g. "Confidential", "Internal", "Public"
    description VARCHAR(255),
    rank INT NOT NULL DEFAULT 0,             -- higher value = higher level
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, name)
);
```

### 6.2 issue_security_members

```sql
CREATE TABLE issue_security_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    security_level_id UUID NOT NULL REFERENCES issue_security_levels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT chk_sec_member CHECK (user_id IS NOT NULL OR role_id IS NOT NULL),
    UNIQUE(security_level_id, user_id, role_id)
);

CREATE INDEX idx_ism_user ON issue_security_members(user_id);
CREATE INDEX idx_ism_role ON issue_security_members(role_id);
```

---

## 7. Category F — System & Audit

### 7.1 notifications

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,               -- issue.assigned | issue.mentioned | report.shared | ai.analysis_complete | mcp.hitl_required
    title VARCHAR(255) NOT NULL,
    body TEXT,
    resource_type VARCHAR(50),               -- issue | report | sprint | mcp_task
    resource_id UUID,
    actor_id UUID REFERENCES users(id),      -- user who triggered this notification
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_recipient ON notifications(recipient_id, is_read, created_at DESC);
```

### 7.2 ai_tasks

```sql
CREATE TABLE ai_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,          -- health_check | risk_scan | daily_report | sprint_review | rag_index | bug_triage
    params JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED', -- QUEUED → PROCESSING → COMPLETED / FAILED / CANCELLED
    progress_percent INT DEFAULT 0,
    progress_message TEXT,
    worker_id VARCHAR(100),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,                -- heartbeat timestamp for zombie-task detection
    heartbeat_interval_seconds INT DEFAULT 30,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    last_error TEXT,
    result JSONB,
    result_summary TEXT,
    tokens_used INT,
    cost_estimate DECIMAL(10,6),
    triggered_by UUID REFERENCES users(id),
    trigger_source VARCHAR(50) DEFAULT 'manual', -- manual | scheduled | mcp | event
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_tasks_heartbeat ON ai_tasks(status, heartbeat_at) WHERE status = 'PROCESSING';
CREATE INDEX idx_ai_tasks_tenant ON ai_tasks(tenant_id, created_at DESC);
```

### 7.3 auth_audit_logs

> ⚠ **Partitioned-table foreign key constraints**: PostgreSQL cannot guarantee global-uniqueness references through foreign keys on a partitioned parent table. The audit log table is a high-frequency-write scenario, so **physical FK constraints are removed**; `user_id` and `tenant_id` are only logical associations. This also substantially improves write performance.

```sql
CREATE TABLE auth_audit_logs (
    id UUID DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,                 -- logical link to tenants(id), no physical FK
    user_id UUID,                            -- logical link to users(id), no physical FK (user may be deleted)
    action VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id)
) PARTITION BY RANGE (created_at);

-- one partition per month
CREATE TABLE auth_audit_logs_2026_06 PARTITION OF auth_audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

---

## 8. ER Relationship Overview

```
┌──────────┐     ┌───────────────┐     ┌──────────────┐
│  tenants │1───N│ tenant_members│N───1│    users     │
└────┬─────┘     └───────┬───────┘     └──────┬───────┘
     │                   │                    │
     │1                  │N                   │1
     │                   │                    │
     ▼                   ▼                    ▼
┌──────────┐     ┌───────────────┐     ┌──────────────┐
│ projects │1───N│project_members│     │  permissions │ (dictionary)
└────┬─────┘     └───────────────┘     └──────┬───────┘
     │                                        │
     │1                              ┌────────┴───────┐
     │                               │ role_permissions│
     ▼                               └────────┬───────┘
┌──────────┐                                 │
│ workflws │                          ┌──────┴───────┐
└──────────┘                          │    roles     │
                                      └──────┬───────┘
┌──────────────┐                             │
│ issue_types  │                    ┌────────┴──────────┐
└──────────────┘                    │ tenant_member_roles│
                                    │ project_member_roles│
┌─────────────────────┐             └───────────────────┘
│issue_security_levels│
└──────────┬──────────┘
           │
    ┌──────┴──────────────┐
    │issue_security_members│
    └─────────────────────┘
```

## 9. updated_at Automation Trigger

> ⚠ `DEFAULT NOW()` only takes effect on INSERT. It is not refreshed automatically on UPDATE. A trigger must be mounted uniformly.

### 9.1 Trigger function

```sql
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 9.2 Tables that need the trigger mounted

```sql
-- all Master tables carrying an updated_at column:
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_ai_tasks_updated_at
    BEFORE UPDATE ON ai_tasks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- comments table (defined in the business-table DDL):
-- CREATE TRIGGER trg_comments_updated_at
--     BEFORE UPDATE ON comments
--     FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### 9.3 Notes

- **`auth_audit_logs`**: append-only, never updated; no trigger needed
- **`notifications` / `email_verifications`**: have no `updated_at` column; no trigger needed
- **If a new table has `updated_at`**: the trigger must be mounted immediately after table creation, otherwise the column will not change on UPDATE

---

## 10. Index Strategy

| Table | Index | Purpose |
|---|------|------|
| users | `email`, `status` | Login lookup + status filtering |
| refresh_tokens | `(user_id, revoked)`, `token_hash` | Per-user token management + hash lookup |
| api_keys | `user_id WHERE is_active` | Active key lookup |
| tenant_members | `user_id`, `tenant_id` | User tenant list + membership verification |
| project_member_roles | `user_id` | User permission computation |
| issue_security_members | `user_id`, `role_id` | Security-level whitelist lookup |
| notifications | `(recipient_id, is_read, created_at DESC)` | Notification list |
| ai_tasks | `(status, heartbeat_at) WHERE status='PROCESSING'` | Zombie-task detection |
| auth_audit_logs | Partition by month | Audit logs partitioned by month |
