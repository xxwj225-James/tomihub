-- Migration: 067_project_role_templates_complete
-- Description: Complete the project role template set + canonical role-name mapping.
--   1. Seed the roles the UI offers but the roles table lacks (Designer, Business
--      Analyst, DevOps Engineer, Technical Writer, Security Engineer) so every
--      member invite resolves to a real role row with permissions.
--   2. Canonicalize free-form project_members.role strings (QA → QA Engineer,
--      viewer → Viewer, case-insensitive developer → Developer) and mirror every
--      resolvable role into project_member_roles so PermissionEvaluator's join
--      path works for ALL projects (064 only handled the demo project).
-- Idempotent.

DO $$
DECLARE
    v_template varchar := '00000000-0000-0000-0000-000000000000';
    v_role RECORD;
BEGIN
    -- ─── 1. Missing template project roles ───
    INSERT INTO roles (tenant_id, name, description, scope, persona, is_system) VALUES
        (v_template, 'Designer',           'Design UI/UX, create and edit issues, comment',    'project', 'developer', TRUE),
        (v_template, 'Business Analyst',   'Gather requirements, create stories, comment',     'project', 'developer', TRUE),
        (v_template, 'DevOps Engineer',    'Deploy, operate, resolve issues, comment',         'project', 'developer', TRUE),
        (v_template, 'Technical Writer',   'Write docs, create and edit issues, comment',      'project', 'developer', TRUE),
        (v_template, 'Security Engineer',  'Security reviews, resolve issues, manage levels',  'project', 'developer', TRUE)
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- Same permission set as Developer (create/edit/comment/resolve, no admin)
    FOR v_role IN SELECT name FROM (VALUES
        ('Designer'), ('Business Analyst'), ('DevOps Engineer'),
        ('Technical Writer'), ('Security Engineer')) AS t(name)
    LOOP
        INSERT INTO role_permissions (role_id, permission_code)
        SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
        WHERE r.name = v_role.name AND r.tenant_id = v_template
          AND p.code IN ('PROJECT:BROWSE',
                         'PROJECT:CREATE_ISSUES', 'PROJECT:EDIT_ISSUES', 'PROJECT:EDIT_OWN_ISSUES',
                         'PROJECT:DELETE_OWN_ISSUES',
                         'PROJECT:ASSIGN_ISSUES', 'PROJECT:RESOLVE_ISSUES',
                         'PROJECT:COMMENT', 'PROJECT:DELETE_OWN_COMMENTS',
                         'PROJECT:VIEW_REPORTS', 'PROJECT:VIEW_AI_ANALYSIS')
        ON CONFLICT (role_id, permission_code) DO NOTHING;
    END LOOP;

    -- Security Engineer additionally manages issue security levels
    INSERT INTO role_permissions (role_id, permission_code)
    SELECT r.id, p.code FROM roles r CROSS JOIN permissions p
    WHERE r.name = 'Security Engineer' AND r.tenant_id = v_template
      AND p.code IN ('PROJECT:SET_SECURITY_LEVEL')
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    -- ─── 2. Canonicalize free-form role strings for EVERY project ───
    -- Case-insensitive canonical match: "developer"/"Developer" → Developer,
    -- "QA"/"qa" → QA Engineer, "viewer" → Viewer, else exact role name.
    UPDATE project_members pm
    SET role_id = r.id
    FROM roles r
    WHERE r.tenant_id = v_template AND r.scope = 'project'
      AND (pm.role_id IS NULL OR pm.role_id = '')
      AND (
            lower(r.name) = lower(pm.role)
            OR (lower(pm.role) = 'qa' AND r.name = 'QA Engineer')
            OR (lower(pm.role) = 'viewer' AND r.name = 'Viewer')
          );

    -- Mirror into project_member_roles so PermissionEvaluator resolves them
    INSERT INTO project_member_roles (project_id, user_id, role_id, granted_by, granted_at)
    SELECT pm.project_id, pm.user_id, pm.role_id, NULL, NOW()
    FROM project_members pm
    WHERE pm.role_id IS NOT NULL
    ON CONFLICT (project_id, user_id, role_id) DO NOTHING;

    RAISE NOTICE '067_project_role_templates_complete: done';
END $$;
