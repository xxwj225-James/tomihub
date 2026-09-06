-- Migration: 064_role_permissions_completion
-- Description: Complete the Role & Permissions system —
--   1. Seed the free-form roles used by demo data (Project Manager, Scrum Master,
--      Release Manager) as real template roles with permission sets.
--   2. Fix the Project Owner gap: the owner role was seeded WITHOUT any
--      role_permissions rows, so a non-tenant-owner project owner had no rights.
--   3. Link project_members.role strings to roles.id and mirror assignments into
--      project_member_roles so PermissionEvaluator resolves them.
--   4. Assign workspace-level roles to tenant members (owner/admin/member/viewer).
--   5. Revoke PROJECT:VIEW_AI_ANALYSIS from Viewer — read-only users must not be
--      able to trigger LLM analysis calls.
-- Idempotent.

DO $$
DECLARE
    v_template varchar := '00000000-0000-0000-0000-000000000000';
    v_demo_project varchar := (SELECT id FROM projects WHERE key = 'DEMO' LIMIT 1);
    v_demo_tenant  varchar := (SELECT tenant_id FROM projects WHERE key = 'DEMO' LIMIT 1);
BEGIN
    -- ─── 1. New template project roles ───
    INSERT INTO roles (tenant_id, name, description, scope, persona, is_system) VALUES
        (v_template, 'Project Manager', 'Full project control — plan, coordinate, manage members', 'project', 'pm', TRUE),
        (v_template, 'Scrum Master',    'Facilitate sprints — manage board, sprints and ceremonies', 'project', 'pm', TRUE),
        (v_template, 'Release Manager', 'Own the release — resolve issues, manage deployment',     'project', 'pm', TRUE)
    ON CONFLICT (tenant_id, name) DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_code)
    SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
    WHERE r.name = 'Project Manager' AND r.tenant_id = v_template
      AND p.code IN ('PROJECT:ADMIN', 'PROJECT:BROWSE',
                     'PROJECT:CREATE_ISSUES', 'PROJECT:EDIT_ISSUES', 'PROJECT:DELETE_ISSUES',
                     'PROJECT:EDIT_OWN_ISSUES', 'PROJECT:DELETE_OWN_ISSUES',
                     'PROJECT:ASSIGN_ISSUES', 'PROJECT:RESOLVE_ISSUES',
                     'PROJECT:COMMENT', 'PROJECT:DELETE_COMMENTS', 'PROJECT:DELETE_OWN_COMMENTS',
                     'PROJECT:MANAGE_SPRINTS', 'PROJECT:MANAGE_BOARD', 'PROJECT:MANAGE_WORKFLOW',
                     'PROJECT:VIEW_REPORTS', 'PROJECT:VIEW_AI_ANALYSIS', 'PROJECT:SET_SECURITY_LEVEL')
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_code)
    SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
    WHERE r.name = 'Scrum Master' AND r.tenant_id = v_template
      AND p.code IN ('PROJECT:BROWSE',
                     'PROJECT:CREATE_ISSUES', 'PROJECT:EDIT_ISSUES', 'PROJECT:EDIT_OWN_ISSUES',
                     'PROJECT:ASSIGN_ISSUES', 'PROJECT:RESOLVE_ISSUES',
                     'PROJECT:COMMENT', 'PROJECT:DELETE_OWN_COMMENTS',
                     'PROJECT:MANAGE_SPRINTS', 'PROJECT:MANAGE_BOARD',
                     'PROJECT:VIEW_REPORTS', 'PROJECT:VIEW_AI_ANALYSIS')
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_code)
    SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
    WHERE r.name = 'Release Manager' AND r.tenant_id = v_template
      AND p.code IN ('PROJECT:BROWSE',
                     'PROJECT:CREATE_ISSUES', 'PROJECT:EDIT_ISSUES', 'PROJECT:EDIT_OWN_ISSUES',
                     'PROJECT:ASSIGN_ISSUES', 'PROJECT:RESOLVE_ISSUES',
                     'PROJECT:COMMENT', 'PROJECT:DELETE_OWN_COMMENTS',
                     'PROJECT:VIEW_REPORTS', 'PROJECT:VIEW_AI_ANALYSIS')
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    -- ─── 2. Project Owner role permission gap fix (owner = full project authority) ───
    INSERT INTO role_permissions (role_id, permission_code)
    SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
    WHERE r.name = 'Project Owner' AND r.tenant_id = v_template
      AND p.code LIKE 'PROJECT:%'
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    -- ─── 3. Link project member role strings to role rows (free-form → canonical) ───
    IF v_demo_project IS NOT NULL THEN
        UPDATE project_members pm
        SET role_id = r.id
        FROM roles r
        WHERE pm.project_id = v_demo_project
          AND r.tenant_id = v_template
          AND r.scope = 'project'
          AND (pm.role_id IS NULL OR pm.role_id = '')
          AND r.name = CASE pm.role
                WHEN 'QA'      THEN 'QA Engineer'
                WHEN 'viewer'  THEN 'Viewer'
                ELSE pm.role
              END;

        -- Mirror into project_member_roles so PermissionEvaluator's join-table path works
        INSERT INTO project_member_roles (project_id, user_id, role_id, granted_by, granted_at)
        SELECT pm.project_id, pm.user_id, pm.role_id, NULL, NOW()
        FROM project_members pm
        WHERE pm.project_id = v_demo_project AND pm.role_id IS NOT NULL
        ON CONFLICT (project_id, user_id, role_id) DO NOTHING;

        -- ─── 4. Workspace-level roles for tenant members ───
        INSERT INTO tenant_member_roles (tenant_id, user_id, role_id, granted_by, granted_at)
        SELECT tm.tenant_id, tm.user_id, r.id, NULL, NOW()
        FROM tenant_members tm
        JOIN roles r ON r.tenant_id = v_template
            AND r.name = CASE tm.role
                WHEN 'owner'  THEN 'Workspace Owner'
                WHEN 'admin'  THEN 'Workspace Admin'
                WHEN 'viewer' THEN 'Workspace Viewer'
                ELSE 'Workspace Member'
              END
        WHERE tm.tenant_id = v_demo_tenant
        ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING;
    END IF;

    -- ─── 5. Read-only users must not trigger LLM analysis ───
    DELETE FROM role_permissions rp
    USING roles r
    WHERE rp.role_id = r.id AND r.name = 'Viewer'
      AND rp.permission_code = 'PROJECT:VIEW_AI_ANALYSIS';

    RAISE NOTICE '064_role_permissions_completion: done';
END $$;
