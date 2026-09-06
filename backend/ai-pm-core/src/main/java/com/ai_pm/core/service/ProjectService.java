package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.common.web.PageResult;
import com.ai_pm.core.entity.Project;
import com.ai_pm.core.entity.ProjectMember;
import com.ai_pm.core.entity.Role;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ai_pm.core.repository.ProjectRepository;
import com.ai_pm.core.repository.RoleRepository;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ai_pm.core.event.PhaseChangedEvent;
import com.ai_pm.core.event.EmbeddingEvent;
import com.ai_pm.core.event.ProjectCreatedEvent;
import org.springframework.context.ApplicationEventPublisher;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepo;
    private final RoleRepository roleRepo;
    private final ProjectMemberService memberService;
    private final ApplicationEventPublisher eventPublisher;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final PermissionEvaluator permissionEvaluator;
    private static final ObjectMapper MAPPER = new ObjectMapper();
    /** System template tenant — canonical role/permission definitions. */
    private static final String SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000000";

    @Transactional(readOnly = true)
    public List<Project> listByTenant(String tenantId, boolean includeClosed) {
        String userId = TenantContextHolder.getUserId();
        // Only show projects the user is a member of
        List<Project> all = projectRepo.findByTenantId(tenantId);
        List<String> memberProjectIds = memberService.getProjectIdsByUser(userId);
        var filtered = all.stream()
            .filter(p -> memberProjectIds.contains(p.getId()))
            .toList();
        if (includeClosed) return filtered;
        return filtered.stream().filter(p -> !"closed".equals(p.getStatus())).toList();
    }

    @Transactional(readOnly = true)
    public PageResult<Project> listByTenantPaged(String tenantId, boolean includeClosed, int pageNum, int size) {
        String userId = TenantContextHolder.getUserId();
        Page<Project> mpPage = new Page<>(pageNum, Math.min(size, 200));
        var result = projectRepo.findByTenantIdPaged(mpPage, tenantId);
        List<String> memberProjectIds = memberService.getProjectIdsByUser(userId);
        var filtered = result.getRecords().stream()
            .filter(p -> memberProjectIds.contains(p.getId()))
            .toList();
        if (!includeClosed) {
            filtered = filtered.stream().filter(p -> !"closed".equals(p.getStatus())).toList();
        }
        return PageResult.of(filtered, result.getTotal(), result.getCurrent(), result.getSize());
    }

    @Transactional
    public Project create(CreateProjectRequest req) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        if (tenantId == null) throw new BusinessException(40300, "No tenant context");

        // Validate key
        String key = req.key().toUpperCase().replaceAll("[^A-Z0-9]", "");
        if (key.length() < 2 || key.length() > 10) {
            throw new BusinessException(40020, "Project key must be 2-10 characters (A-Z, 0-9)");
        }
        if (projectRepo.existsByTenantAndKey(tenantId, key)) {
            throw new BusinessException(40021, "Project key already exists");
        }

        Project project = new Project();
        project.setTenantId(tenantId);
        project.setName(req.name());
        project.setKey(key);
        project.setDescription(req.description());
        project.setLeadId(userId);
        project.setVisibility("private");
        project.setStatus("active");
        // Store methodology in settings JSON
        String method = req.methodology() != null ? req.methodology() : "scrum";
        project.setSettings("{\"methodology\":\"" + method + "\"}");
        projectRepo.insert(project);

        log.info("Project created: {} (key={}, tenant={})", project.getName(), key, tenantId);

        // Auto-add creator as project member with Project Owner role.
        // addInternal skips the PROJECT:ADMIN guard (the creator has no project
        // role yet) and is non-transactional, so a failure here can't mark this
        // transaction rollback-only and blow up the commit.
        try {
            memberService.addInternal(project.getId(), userId, "Project Owner");
            log.info("Creator added as project member: user={}, project={}, role=Project Owner", userId, project.getId());
        } catch (Exception e) {
            log.warn("Failed to add creator as project member: {}", e.getMessage());
        }

        // Trigger async embedding generation for project background
        eventPublisher.publishEvent(EmbeddingEvent.projectChanged(
            tenantId, project.getId(), project.getName(),
            project.getDescription(), true));

        // Publish project created event — WikiTemplateListener will handle wiki template generation
        eventPublisher.publishEvent(new ProjectCreatedEvent(
            tenantId, project.getId(), project.getName(),
            project.getDescription(), req.generateWiki()));

        return project;
    }

    @Transactional
    public Project update(String projectId, String name, String description, String settings, String phase) {
        verifyMember(projectId);
        enforceSettingsEdit(projectId);
        Project project = projectRepo.selectById(projectId);
        if (project == null) throw new BusinessException(40400, "Project not found");
        if (name != null) project.setName(name);
        if (description != null) project.setDescription(description);
        if (settings != null) {
            // Merge: incoming settings only carry UI-managed keys (methodology/columns);
            // server-managed keys (phases, rolePermissions) must be preserved.
            project.setSettings(mergeSettings(project.getSettings(), settings));
        }
        String oldPhase = project.getPhase();
        if (phase != null) project.setPhase(phase);
        projectRepo.updateProject(project);
        log.info("Project updated: {}", projectId);

        // Publish event if phase changed — listeners react asynchronously
        if (phase != null && !phase.equals(oldPhase)) {
            int oldIdx = java.util.List.of("initiation","planning","development","testing","closure","uat","maintenance")
                .indexOf(oldPhase != null ? oldPhase : "development");
            int newIdx = java.util.List.of("initiation","planning","development","testing","closure","uat","maintenance")
                .indexOf(phase);
            String tid = TenantContextHolder.getTenantId();
            boolean isForward = newIdx > oldIdx;
            log.info("Publishing PhaseChangedEvent: tenant={}, project={}, {}→{}, forward={}",
                tid, projectId, oldPhase, phase, isForward);
            eventPublisher.publishEvent(new PhaseChangedEvent(
                tid, projectId, project.getName(),
                oldPhase, phase, isForward));
        }

        // Trigger async embedding generation when description changes (project background)
        if (description != null) {
            eventPublisher.publishEvent(EmbeddingEvent.projectChanged(
                TenantContextHolder.getTenantId(), projectId, project.getName(),
                project.getDescription(), false));
        }

        return project;
    }

    @Transactional
    public Project updateStatus(String projectId, String status) {
        verifyMember(projectId);
        enforceSettingsEdit(projectId);
        Project project = projectRepo.selectById(projectId);
        if (project == null) throw new BusinessException(40400, "Project not found");
        project.setStatus(status);
        projectRepo.updateProject(project);
        log.info("Project status updated: id={}, status={}", projectId, status);
        return project;
    }

    @Transactional(readOnly = true)
    public Project getById(String projectId) {
        Project project = projectRepo.selectById(projectId);
        if (project == null) throw new BusinessException(40400, "Project not found");
        verifyMember(projectId);
        return project;
    }

    @Transactional(readOnly = true)
    public void verifyMember(String projectId) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) throw new BusinessException(40100, "Not authenticated");
        if (!memberService.isMember(projectId, userId)) {
            throw new BusinessException(40300, "You are not a member of this project");
        }
    }

    /** Verify project is active — throw if closed (read-only). */
    @Transactional(readOnly = true)
    public void verifyProjectActive(String projectId) {
        Project project = projectRepo.selectById(projectId);
        if (project == null) throw new BusinessException(40400, "Project not found");
        if ("closed".equals(project.getStatus())) {
            throw new BusinessException(40300, "This project is closed (read-only). Reopen it to make changes.");
        }
    }

    @Transactional(readOnly = true)
    public java.util.Map<String, Object> getStats(String projectId) {
        verifyMember(projectId);
        String tenantId = TenantContextHolder.getTenantId();
        var list = projectRepo.getIssueStatsByProject(tenantId, projectId);
        return (list != null && !list.isEmpty()) ? list.get(0) : java.util.Map.of();
    }

    // ─── Project settings editing (phases, role permissions) ───

    /**
     * Settings edits require PROJECT:ADMIN — granted by project roles
     * (Project Owner / Lead / Manager) or workspace-level roles (owner/admin),
     * including per-project role-permission overrides.
     */
    private void verifySettingsEditor(String projectId) {
        permissionEvaluator.enforce(TenantContextHolder.getUserId(),
            TenantContextHolder.getTenantId(), projectId, "PROJECT:ADMIN");
    }

    /**
     * Project-level settings edit guard used by update()/updateStatus().
     * Skips when no user context (internal/system flows are not user actions).
     */
    private void enforceSettingsEdit(String projectId) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return;
        verifySettingsEditor(projectId);
    }

    /** Merge incoming settings JSON into the stored one, preserving server-managed keys. */
    private String mergeSettings(String existing, String incoming) {
        try {
            var base = MAPPER.readTree(existing != null && !existing.isBlank() ? existing : "{}");
            var patch = MAPPER.readTree(incoming);
            if (base.isObject() && patch.isObject()) {
                var obj = (com.fasterxml.jackson.databind.node.ObjectNode) base;
                patch.fields().forEachRemaining(e -> obj.set(e.getKey(), e.getValue()));
                return MAPPER.writeValueAsString(obj);
            }
        } catch (Exception e) {
            log.warn("Failed to merge project settings: {}", e.getMessage());
        }
        return incoming;
    }

    @Transactional(readOnly = true)
    public java.util.List<java.util.Map<String, String>> getPhases(String projectId) {
        verifyMember(projectId);
        Project p = projectRepo.selectById(projectId);
        if (p == null) throw new BusinessException(40400, "Project not found");
        // Project custom phases from settings
        try {
            var settings = p.getSettings();
            if (settings != null && !settings.isBlank()) {
                var node = MAPPER.readTree(settings);
                var phases = node.get("phases");
                if (phases != null && phases.isArray() && phases.size() > 0) {
                    var result = new java.util.ArrayList<java.util.Map<String, String>>();
                    phases.forEach(ph -> {
                        var m = new java.util.HashMap<String, String>();
                        m.put("key", ph.has("key") ? ph.get("key").asText() : "");
                        m.put("value", ph.has("value") ? ph.get("value").asText() : "");
                        result.add(m);
                    });
                    return result;
                }
            }
        } catch (Exception ignored) { }
        // Fallback: global defaults from master_data (project lifecycle phases)
        return jdbc.queryForList(
            "SELECT key, value FROM master_data WHERE category = 'project_phase' AND (methodology IS NULL OR methodology = '') ORDER BY sort_order")
            .stream()
            .map(row -> java.util.Map.of("key", String.valueOf(row.get("key")), "value", String.valueOf(row.get("value"))))
            .toList();
    }

    @Transactional
    public java.util.List<java.util.Map<String, String>> updatePhases(
            String projectId, java.util.List<java.util.Map<String, String>> phases) {
        verifyMember(projectId);
        verifySettingsEditor(projectId);
        Project p = projectRepo.selectById(projectId);
        if (p == null) throw new BusinessException(40400, "Project not found");
        try {
            var node = MAPPER.readTree(p.getSettings() != null && !p.getSettings().isBlank()
                ? p.getSettings() : "{}");
            var obj = node.isObject() ? ((com.fasterxml.jackson.databind.node.ObjectNode) node)
                : MAPPER.createObjectNode();
            obj.set("phases", MAPPER.valueToTree(phases));
            p.setSettings(MAPPER.writeValueAsString(obj));
            projectRepo.updateProject(p);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(50000, "Failed to update phases: " + e.getMessage());
        }
        return getPhases(projectId);
    }

    // ─── Role & Permissions — per-project customizable role permission matrix ───

    /**
     * Build the role × permission matrix: project-scoped roles (tenant's own +
     * system template), their effective permission codes (per-project overrides
     * applied) and whether the current user may edit it.
     */
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> getRolePermissions(String projectId) {
        verifyMember(projectId);
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        // Project roles — system template definitions, tenant copies take precedence by name
        java.util.Map<String, Role> rolesByName = new java.util.LinkedHashMap<>();
        for (Role r : roleRepo.findByTenantAndScope(SYSTEM_TENANT_ID, "project")) rolesByName.put(r.getName(), r);
        for (Role r : roleRepo.findByTenantAndScope(tenantId, "project")) rolesByName.put(r.getName(), r);

        java.util.Map<String, java.util.List<String>> overrides =
            permissionEvaluator.getRolePermissionOverrides(projectId);

        var roles = rolesByName.values().stream().map(r -> {
            java.util.List<String> codes = overrides.containsKey(r.getName())
                ? overrides.get(r.getName())
                : roleRepo.findPermissionCodesByRoleId(r.getId());
            return java.util.Map.of(
                "name", r.getName(),
                "description", r.getDescription() != null ? r.getDescription() : "",
                "isSystem", r.getIsSystem() != null ? r.getIsSystem() : false,
                "permissions", codes != null ? codes : java.util.List.of());
        }).toList();

        var permissions = jdbc.queryForList(
            "SELECT code, description, is_dangerous FROM permissions WHERE category = 'PROJECT' ORDER BY code")
            .stream().map(row -> java.util.Map.of(
                "code", String.valueOf(row.get("code")),
                "description", String.valueOf(row.get("description")),
                "dangerous", Boolean.TRUE.equals(row.get("is_dangerous"))))
            .toList();

        boolean canEdit = permissionEvaluator.hasPermission(userId, tenantId, projectId, "PROJECT:ADMIN");
        return java.util.Map.of("roles", roles, "permissions", permissions, "canEdit", canEdit);
    }

    /**
     * Save per-project role permission overrides into project settings.
     * PROJECT:ADMIN only; the Project Owner role must always keep PROJECT:ADMIN
     * so a project can never lock itself out.
     */
    @Transactional
    public java.util.Map<String, Object> updateRolePermissions(
            String projectId, java.util.Map<String, java.util.List<String>> rolePermissions) {
        verifyMember(projectId);
        String userId = TenantContextHolder.getUserId();
        String tenantId = TenantContextHolder.getTenantId();
        verifySettingsEditor(projectId);

        var ownerPerms = rolePermissions == null ? null : rolePermissions.get("Project Owner");
        if (ownerPerms == null || !ownerPerms.contains("PROJECT:ADMIN")) {
            throw new BusinessException(40303, "Project Owner must always keep PROJECT:ADMIN permission");
        }

        Project p = projectRepo.selectById(projectId);
        if (p == null) throw new BusinessException(40400, "Project not found");
        try {
            var node = MAPPER.readTree(p.getSettings() != null && !p.getSettings().isBlank()
                ? p.getSettings() : "{}");
            var obj = node.isObject() ? ((com.fasterxml.jackson.databind.node.ObjectNode) node)
                : MAPPER.createObjectNode();
            obj.set("rolePermissions", MAPPER.valueToTree(rolePermissions));
            p.setSettings(MAPPER.writeValueAsString(obj));
            projectRepo.updateProject(p);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(50000, "Failed to update role permissions: " + e.getMessage());
        }

        // Overrides change effective permissions for every member — drop caches.
        permissionEvaluator.evictUserCache(userId, tenantId, projectId);
        permissionEvaluator.evictProjectCache(tenantId, projectId);
        return getRolePermissions(projectId);
    }

    // ─── L2: per-project health dimension weights (docs/health-dim-weights-design.md) ───

    /** Default dimension weights (percentage points) — mirrors PROJECT_DIM_WEIGHTS in ai-brain. */
    public static final java.util.Map<String, Integer> DEFAULT_DIM_WEIGHTS = java.util.Map.of(
        "schedule", 25, "quality", 25, "delivery", 15,
        "resources", 15, "scope", 10, "collaboration", 10);

    private static final java.util.Set<String> DIM_KEYS = java.util.Set.of(
        "schedule", "quality", "delivery", "resources", "scope", "collaboration");

    /**
     * Read the project's custom dimension weights from settings.dimWeights.
     * Returns the global defaults when unset/invalid — the health score stays
     * comparable across projects unless a PM explicitly overrides.
     */
    @Transactional(readOnly = true)
    public java.util.Map<String, Integer> getDimWeights(String projectId) {
        verifyMember(projectId);
        Project p = projectRepo.selectById(projectId);
        if (p == null) throw new BusinessException(40400, "Project not found");
        try {
            var node = MAPPER.readTree(p.getSettings() != null && !p.getSettings().isBlank()
                ? p.getSettings() : "{}");
            var dw = node.get("dimWeights");
            if (dw != null && dw.isObject()) {
                var result = new java.util.HashMap<String, Integer>();
                int sum = 0;
                for (var it = dw.fields(); it.hasNext();) {
                    var e = it.next();
                    if (DIM_KEYS.contains(e.getKey()) && e.getValue().isInt()) {
                        int v = e.getValue().asInt();
                        result.put(e.getKey(), v);
                        sum += v;
                    }
                }
                if (result.size() == 6 && sum == 100) {
                    return result;
                }
            }
        } catch (Exception ignored) { }
        return DEFAULT_DIM_WEIGHTS;
    }

    /**
     * Save custom dimension weights. PROJECT:ADMIN only. Validates the 6 keys
     * are present, each 0–100 and the total is exactly 100. Records the change
     * (who/when) inside settings for the activity log, then invalidates the
     * project_health cache so the next analysis recomputes with the new weights.
     */
    @Transactional
    public java.util.Map<String, Integer> updateDimWeights(
            String projectId, java.util.Map<String, Integer> weights) {
        verifyMember(projectId);
        verifySettingsEditor(projectId);
        Project p = projectRepo.selectById(projectId);
        if (p == null) throw new BusinessException(40400, "Project not found");

        if (weights == null || weights.size() != 6
                || !weights.keySet().containsAll(DIM_KEYS)) {
            throw new BusinessException(40000, "dimWeights must contain all 6 dimensions");
        }
        int sum = 0;
        for (var e : weights.entrySet()) {
            int v = e.getValue() == null ? -1 : e.getValue();
            if (v < 0 || v > 100) {
                throw new BusinessException(40000, "Each dimension weight must be 0–100");
            }
            sum += v;
        }
        if (sum != 100) {
            throw new BusinessException(40000, "dimWeights must sum to 100 (got " + sum + ")");
        }

        String userId = TenantContextHolder.getUserId();
        var oldWeights = getDimWeights(projectId);
        try {
            var node = MAPPER.readTree(p.getSettings() != null && !p.getSettings().isBlank()
                ? p.getSettings() : "{}");
            var obj = node.isObject() ? ((com.fasterxml.jackson.databind.node.ObjectNode) node)
                : MAPPER.createObjectNode();
            obj.set("dimWeights", MAPPER.valueToTree(weights));
            obj.put("dimWeightsUpdatedAt", java.time.Instant.now().toString());
            if (userId != null) obj.put("dimWeightsUpdatedBy", userId);
            p.setSettings(MAPPER.writeValueAsString(obj));
            projectRepo.updateProject(p);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(50000, "Failed to update dimension weights: " + e.getMessage());
        }

        // Invalidate the cached project_health so the next read recomputes with
        // the new weights (docs/health-dim-weights-design.md §2 L2 cache invalidation).
        try {
            jdbc.update("DELETE FROM ai_analyses WHERE project_id = ? AND analysis_type = 'project_health'",
                projectId);
        } catch (Exception e) {
            log.warn("Failed to invalidate project_health cache for {}: {}", projectId, e.getMessage());
        }

        log.info("Dimension weights updated for {}: {} (by {})", projectId, weights, userId);
        return weights;
    }

    public record CreateProjectRequest(String name, String key, String description, boolean generateWiki, String methodology) {}
}
