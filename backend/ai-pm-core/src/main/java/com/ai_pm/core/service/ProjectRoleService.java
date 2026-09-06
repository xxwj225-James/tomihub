package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.repository.ProjectMemberRoleRepository;
import com.ai_pm.core.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProjectRoleService {

    private final ProjectMemberRoleRepository pmrRepo;
    private final RoleRepository roleRepo;

    /**
     * Assign a role to a user in a project.
     */
    @Transactional
    public void assignRole(String projectId, String userId, String roleId) {
        // Validate role exists and is project-scoped
        var role = roleRepo.selectById(roleId);
        if (role == null || !"project".equals(role.getScope())) {
            throw new BusinessException(40012, "Invalid project role");
        }

        pmrRepo.assignRole(projectId, userId, roleId, TenantContextHolder.getUserId());
    }

    /**
     * Revoke a role from a user in a project.
     */
    @Transactional
    public void revokeRole(String projectId, String userId, String roleId) {
        pmrRepo.revokeRole(projectId, userId, roleId);
    }

    /**
     * List all role assignments for a project member.
     */
    @Transactional(readOnly = true)
    public List<String> getUserRoles(String projectId, String userId) {
        return pmrRepo.findRoleIdsByUser(projectId, userId);
    }
}
