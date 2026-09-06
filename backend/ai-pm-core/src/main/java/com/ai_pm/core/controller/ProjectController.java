package com.ai_pm.core.controller;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.ProjectVO;
import com.ai_pm.core.service.ProjectService;
import com.ai_pm.core.service.ProjectService.CreateProjectRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/projects")
@RequiredArgsConstructor
@Validated
public class ProjectController {

    private final ProjectService projectService;
    private final JdbcTemplate jdbc;

    @GetMapping
    public ApiResponse<?> list(@RequestParam(name = "includeClosed", defaultValue = "false") boolean includeClosed,
                               @RequestParam(defaultValue = "1") int page,
                               @RequestParam(defaultValue = "50") int size) {
        String tenantId = TenantContextHolder.getTenantId();
        return ApiResponse.success(projectService.listByTenantPaged(tenantId, includeClosed, page, Math.min(size, 200)).map(ProjectVO::from));
    }

    @GetMapping("/{id}")
    public ApiResponse<ProjectVO> get(@PathVariable("id") String id) {
        return ApiResponse.success(ProjectVO.from(projectService.getById(id)));
    }

    @GetMapping("/{id}/stats")
    public ApiResponse<Map<String, Object>> stats(@PathVariable("id") String id) {
        return ApiResponse.success(projectService.getStats(id));
    }

    // ─── Project phases — per-project customizable lifecycle stages ───

    @GetMapping("/{id}/phases")
    public ApiResponse<java.util.List<java.util.Map<String, String>>> phases(@PathVariable("id") String id) {
        return ApiResponse.success(projectService.getPhases(id));
    }

    @PutMapping("/{id}/phases")
    public ApiResponse<java.util.List<java.util.Map<String, String>>> updatePhases(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        var phases = (java.util.List<java.util.Map<String, String>>) body.get("phases");
        return ApiResponse.success(projectService.updatePhases(id, phases));
    }

    // ─── Role & Permissions — per-project customizable role permission matrix ───

    @GetMapping("/{id}/role-permissions")
    public ApiResponse<java.util.Map<String, Object>> rolePermissions(@PathVariable("id") String id) {
        return ApiResponse.success(projectService.getRolePermissions(id));
    }

    @PutMapping("/{id}/role-permissions")
    public ApiResponse<java.util.Map<String, Object>> updateRolePermissions(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        var rolePermissions = (java.util.Map<String, java.util.List<String>>) body.get("rolePermissions");
        return ApiResponse.success(projectService.updateRolePermissions(id, rolePermissions));
    }

    // ─── L2: per-project health dimension weights (docs/health-dim-weights-design.md) ───

    @GetMapping("/{id}/dim-weights")
    public ApiResponse<java.util.Map<String, Integer>> dimWeights(@PathVariable("id") String id) {
        return ApiResponse.success(projectService.getDimWeights(id));
    }

    @PutMapping("/{id}/dim-weights")
    public ApiResponse<java.util.Map<String, Integer>> updateDimWeights(
            @PathVariable("id") String id,
            @RequestBody java.util.Map<String, Integer> body) {
        return ApiResponse.success(projectService.updateDimWeights(id, body));
    }

    @PostMapping
    public ApiResponse<ProjectVO> create(@Valid @RequestBody CreateProjectBody req) {
        return ApiResponse.success(ProjectVO.from(projectService.create(
            new CreateProjectRequest(req.name(), req.key(), req.description(), req.generateWiki(), req.methodology()))));
    }

    @PutMapping("/{id}")
    public ApiResponse<ProjectVO> update(@PathVariable("id") String id,
                                        @RequestBody UpdateProjectBody body) {
        return ApiResponse.success(ProjectVO.from(projectService.update(id, body.name(), body.description(), body.settings(), body.phase())));
    }

    @PutMapping("/{id}/status")
    public ApiResponse<ProjectVO> updateStatus(@PathVariable("id") String id,
                                              @RequestBody Map<String, String> body) {
        String status = body.get("status");
        if (status == null || (!status.equals("active") && !status.equals("closed"))) {
            return ApiResponse.error(400, "Status must be 'active' or 'closed'");
        }
        return ApiResponse.success(ProjectVO.from(projectService.updateStatus(id, status)));
    }

    @GetMapping("/leads")
    public ApiResponse<List<Map<String, String>>> leads() {
        String tenantId = TenantContextHolder.getTenantId();
        // Include both project leads AND project owners (members with admin/owner roles)
        List<Map<String, String>> leads = jdbc.queryForList(
            "SELECT DISTINCT u.id, u.display_name as name FROM users u WHERE u.id IN (" +
            "  SELECT p.lead_id FROM projects p WHERE p.tenant_id = ? " +
            "  UNION " +
            "  SELECT pm.user_id FROM project_members pm " +
            "  JOIN roles r ON pm.role_id = r.id " +
            "  JOIN projects p2 ON pm.project_id = p2.id " +
            "  WHERE p2.tenant_id = ? AND (r.name ILIKE '%owner%' OR r.name ILIKE '%admin%' OR r.persona = 'pm')" +
            ") ORDER BY u.display_name",
            tenantId, tenantId).stream()
            .map(r -> Map.of("id", (String) r.get("id"), "name", (String) r.get("name")))
            .toList();
        return ApiResponse.success(leads);
    }

    @GetMapping("/{projectId}/activity")
    public ApiResponse<List<Map<String, Object>>> activity(@PathVariable("projectId") String projectId,
                                                            @RequestParam(defaultValue = "0") int offset,
                                                            @RequestParam(defaultValue = "50") int limit) {
        projectService.verifyMember(projectId);
        String sql = """
            SELECT * FROM (
            (SELECT i.id, p.key || '-' || i.issue_number || ': ' || i.title AS summary,
                    'issue_created' AS event_type,
                    COALESCE(u.display_name, u.email, i.reporter_id) AS actor, i.created_at
             FROM issues i JOIN users u ON i.reporter_id = u.id
             JOIN projects p ON i.project_id = p.id
             WHERE i.project_id = ?)
            UNION ALL
            (SELECT cl.issue_id AS id,
                    p.key || '-' || i.issue_number || ': ' || cl.old_value || ' → ' || cl.new_value AS summary,
                    'status_change' AS event_type,
                    COALESCE(u.display_name, u.email, cl.changed_by) AS actor, cl.created_at
             FROM issue_changelog cl JOIN issues i ON cl.issue_id = i.id
             JOIN projects p ON i.project_id = p.id
             JOIN users u ON cl.changed_by = u.id
             WHERE i.project_id = ? AND cl.field = 'status')
            UNION ALL
            (SELECT c.issue_id AS id,
                    p.key || '-' || i.issue_number || ': ' || LEFT(c.body, 150) AS summary,
                    'comment' AS event_type,
                    COALESCE(c.author_name, u.display_name, u.email, c.author_id) AS actor, c.created_at
             FROM comments c JOIN issues i ON c.issue_id = i.id
             JOIN projects p ON i.project_id = p.id
             LEFT JOIN users u ON c.author_id = u.id
             WHERE i.project_id = ?)
            UNION ALL
            (SELECT p2.id,
                    p2.name || ': phase → ' || p2.phase AS summary,
                    'phase_change' AS event_type,
                    'System' AS actor, p2.updated_at AS created_at
             FROM projects p2
             WHERE p2.id = ? AND p2.phase IS NOT NULL)
            UNION ALL
            (SELECT p3.id,
                    p3.name || ': description updated' AS summary,
                    'desc_change' AS event_type,
                    'System' AS actor, p3.updated_at AS created_at
             FROM projects p3
             WHERE p3.id = ? AND p3.description IS NOT NULL AND p3.description != '')
            UNION ALL
            (SELECT kp.id,
                    p4.key || ': wiki ' || CASE WHEN kp.created_at = kp.updated_at THEN 'created' ELSE 'updated' END || ' — ' || kp.title AS summary,
                    'wiki_change' AS event_type,
                    COALESCE(u2.display_name, 'System') AS actor, kp.updated_at AS created_at
             FROM knowledge_pages kp
             JOIN projects p4 ON kp.project_id = p4.id
             LEFT JOIN users u2 ON kp.created_by = u2.id
             WHERE kp.project_id = ?)
            UNION ALL
            (SELECT p5.id,
                    p5.name || ': health weights updated' AS summary,
                    'health_weights_updated' AS event_type,
                    COALESCE(u3.display_name, 'System') AS actor,
                    (p5.settings::jsonb ->> 'dimWeightsUpdatedAt')::timestamptz AS created_at
             FROM projects p5
             LEFT JOIN users u3 ON p5.settings::jsonb ->> 'dimWeightsUpdatedBy' = u3.id
             WHERE p5.id = ?
               AND p5.settings IS NOT NULL
               AND p5.settings::jsonb ? 'dimWeightsUpdatedAt')
            ) act
            ORDER BY act.created_at DESC LIMIT ? OFFSET ?
        """;
        return ApiResponse.success(jdbc.queryForList(sql,
            projectId, projectId, projectId, projectId, projectId, projectId, projectId,
            Math.min(Math.max(limit, 1), 200), Math.max(offset, 0)));
    }

    public record CreateProjectBody(
        @NotBlank String name,
        @NotBlank String key,
        String description,
        boolean generateWiki,
        String methodology
    ) {}

    public record UpdateProjectBody(String name, String description, String settings, String phase) {}
}
