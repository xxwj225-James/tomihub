package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.common.web.PageResult;
import com.ai_pm.core.entity.ProjectMember;
import com.ai_pm.core.repository.ProjectMemberRepository;
import com.ai_pm.core.repository.ProjectMemberRoleRepository;
import com.ai_pm.core.repository.RoleRepository;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectMemberService {

    private final ProjectMemberRepository memberRepo;
    private final RoleRepository roleRepo;
    private final ProjectMemberRoleRepository pmrRepo;
    private final PermissionEvaluator permissionEvaluator;

    /**
     * UI/free-form role strings → canonical roles table names (case-insensitive).
     * The roles table stores 'Developer' / 'QA Engineer' / 'Viewer' etc. while
     * clients send 'developer', 'QA', 'viewer' — an exact-name lookup misses
     * those and the member ends up with ZERO permissions (403 everywhere).
     */
    private static final Map<String, String> ROLE_ALIASES = Map.ofEntries(
        Map.entry("developer", "Developer"),
        Map.entry("qa", "QA Engineer"),
        Map.entry("viewer", "Viewer"),
        Map.entry("pm", "Project Manager"),
        Map.entry("project manager", "Project Manager"),
        Map.entry("lead", "Project Lead"),
        Map.entry("project lead", "Project Lead"),
        Map.entry("owner", "Project Owner"),
        Map.entry("project owner", "Project Owner"),
        Map.entry("scrum master", "Scrum Master"),
        Map.entry("release manager", "Release Manager"),
        Map.entry("designer", "Designer"),
        Map.entry("business analyst", "Business Analyst"),
        Map.entry("devops engineer", "DevOps Engineer"),
        Map.entry("technical writer", "Technical Writer"),
        Map.entry("security engineer", "Security Engineer")
    );

    /** Canonical role name for any free-form input; unknown strings pass through. */
    private String normalizeProjectRole(String role) {
        if (role == null || role.isBlank()) return "Developer";
        String canonical = ROLE_ALIASES.get(role.trim().toLowerCase(Locale.ROOT));
        return canonical != null ? canonical : role.trim();
    }

    /** Member management requires PROJECT:ADMIN; internal/system flows (no user) pass. */
    private void enforceManageMembers(String projectId) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return;
        permissionEvaluator.enforce(userId, TenantContextHolder.getTenantId(), projectId, "PROJECT:ADMIN");
    }

    @Transactional(readOnly = true)
    public List<ProjectMember> listByProject(String projectId) {
        return memberRepo.findByProjectId(projectId);
    }

    @Transactional(readOnly = true)
    public PageResult<ProjectMember> listByProjectPaged(String projectId, int pageNum, int size) {
        Page<ProjectMember> mpPage = new Page<>(pageNum, Math.min(size, 200));
        var result = memberRepo.findByProjectIdPaged(mpPage, projectId);
        return PageResult.of(result);
    }

    @Transactional(readOnly = true)
    public List<String> getProjectIdsByUser(String userId) {
        return memberRepo.findProjectIdsByUserId(userId);
    }

    @Transactional(readOnly = true)
    public boolean isMember(String projectId, String userId) {
        return memberRepo.findByProjectAndUser(projectId, userId).isPresent();
    }

    @Transactional
    public ProjectMember add(String projectId, String userId, String role) {
        enforceManageMembers(projectId);
        return addInternal(projectId, userId, role);
    }

    /**
     * Add a project member without the PROJECT:ADMIN guard. Used by project
     * creation to auto-add the creator — who has no project role yet, so the
     * guard would 403 them out of their own new project. Deliberately NOT
     * @Transactional: an exception here must not mark the caller's transaction
     * rollback-only, or ProjectService.create() (which swallows member-add
     * failures so the project still persists) dies at commit with an
     * UnexpectedRollbackException.
     */
    ProjectMember addInternal(String projectId, String userId, String role) {
        if (memberRepo.findByProjectAndUser(projectId, userId).isPresent()) {
            throw new BusinessException(40022, "Member already in project");
        }
        ProjectMember pm = new ProjectMember();
        pm.setProjectId(projectId);
        pm.setUserId(userId);
        String r = normalizeProjectRole(role);
        pm.setRole(r);
        // Look up role ID from roles table and keep the join table in sync
        try {
            String roleId = roleRepo.findProjectRoleIdByName(r);
            if (roleId != null) {
                pm.setRoleId(roleId);
                pmrRepo.assignRole(projectId, userId, roleId, TenantContextHolder.getUserId());
            }
        } catch (Exception e) {
            log.warn("Could not look up role ID for '{}': {}", r, e.getMessage());
        }
        memberRepo.insert(pm);
        permissionEvaluator.evictUserCache(userId, TenantContextHolder.getTenantId(), projectId);
        log.info("Member added: project={}, user={}, role={}, roleId={}", projectId, userId, r, pm.getRoleId());
        return pm;
    }

    @Transactional
    public ProjectMember updateRole(String projectId, String userId, String role) {
        enforceManageMembers(projectId);
        String currentUser = TenantContextHolder.getUserId();
        if (currentUser != null && currentUser.equals(userId)) {
            throw new BusinessException(40031, "Cannot change your own role");
        }
        ProjectMember pm = memberRepo.findByProjectAndUser(projectId, userId)
            .orElseThrow(() -> new BusinessException(40400, "Member not found"));
        if ("Project Owner".equals(pm.getRole()) && !"Project Owner".equals(
            memberRepo.findByProjectAndUser(projectId, currentUser).map(ProjectMember::getRole).orElse(""))) {
            throw new BusinessException(40032, "Only a Project Owner can change the Owner's role");
        }
        String r = normalizeProjectRole(role);
        pm.setRole(r);
        try {
            String roleId = roleRepo.findProjectRoleIdByName(r);
            if (roleId != null) {
                // Revoke previous assignments first — assignRole is insert-only
                // (ON CONFLICT DO NOTHING), so a role change would otherwise
                // leave the old role's permissions active.
                List<String> oldIds = pmrRepo.findRoleIdsByUser(projectId, userId);
                for (String oldId : oldIds) {
                    if (!oldId.equals(roleId)) pmrRepo.revokeRole(projectId, userId, oldId);
                }
                pm.setRoleId(roleId);
                pmrRepo.assignRole(projectId, userId, roleId, currentUser);
            }
        } catch (Exception e) {
            log.warn("Could not look up role ID for '{}': {}", r, e.getMessage());
        }
        memberRepo.updateById(pm);
        permissionEvaluator.evictUserCache(userId, TenantContextHolder.getTenantId(), projectId);
        return pm;
    }

    @Transactional
    public void remove(String projectId, String userId) {
        enforceManageMembers(projectId);
        String currentUser = TenantContextHolder.getUserId();
        if (currentUser != null && currentUser.equals(userId)) {
            throw new BusinessException(40030, "Cannot remove yourself from the project");
        }
        ProjectMember pm = memberRepo.findByProjectAndUser(projectId, userId)
            .orElseThrow(() -> new BusinessException(40400, "Member not found"));
        if ("Project Owner".equals(pm.getRole()) && !"Project Owner".equals(
            memberRepo.findByProjectAndUser(projectId, currentUser).map(ProjectMember::getRole).orElse(""))) {
            throw new BusinessException(40032, "Only a Project Owner can remove the Owner");
        }
        memberRepo.deleteById(pm.getId());
        // Clean up role assignments from the join table
        List<String> roleIds = pmrRepo.findRoleIdsByUser(projectId, userId);
        for (String rid : roleIds) pmrRepo.revokeRole(projectId, userId, rid);
        permissionEvaluator.evictUserCache(userId, TenantContextHolder.getTenantId(), projectId);
        log.info("Member removed: project={}, user={}", projectId, userId);
    }
}
