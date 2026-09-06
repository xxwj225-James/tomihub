package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.dto.RoleRequest;
import com.ai_pm.core.entity.Role;
import com.ai_pm.core.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roleRepo;

    @Transactional(readOnly = true)
    public List<Role> listRoles(String tenantId) {
        return roleRepo.findByTenantId(tenantId);
    }

    @Transactional(readOnly = true)
    public List<Role> listRolesByScope(String tenantId, String scope) {
        return roleRepo.findByTenantAndScope(tenantId, scope);
    }

    @Transactional
    public Role createRole(String tenantId, RoleRequest.Create req) {
        // Check name uniqueness
        List<Role> existing = roleRepo.findByTenantId(tenantId);
        boolean duplicate = existing.stream().anyMatch(r -> r.getName().equals(req.name()));
        if (duplicate) {
            throw new BusinessException(40010, "Role name already exists");
        }

        Role role = new Role();
        role.setTenantId(tenantId);
        role.setName(req.name());
        role.setDescription(req.description());
        role.setScope(req.scope());
        role.setIsSystem(false);
        roleRepo.insert(role);

        // Assign permissions
        if (req.permissionCodes() != null && !req.permissionCodes().isEmpty()) {
            roleRepo.assignPermissions(role.getId(), req.permissionCodes());
        }

        role.setPermissionCodes(req.permissionCodes());
        return role;
    }

    @Transactional
    public Role updateRole(String roleId, RoleRequest.Update req) {
        Role role = roleRepo.selectById(roleId);
        if (role == null) {
            throw new BusinessException(40400, "Role not found", HttpStatus.NOT_FOUND);
        }
        if (Boolean.TRUE.equals(role.getIsSystem())) {
            throw new BusinessException(40011, "System roles cannot be modified");
        }

        if (req.name() != null) role.setName(req.name());
        if (req.description() != null) role.setDescription(req.description());
        roleRepo.updateById(role);

        if (req.permissionCodes() != null) {
            roleRepo.removePermissions(roleId);
            if (!req.permissionCodes().isEmpty()) {
                roleRepo.assignPermissions(roleId, req.permissionCodes());
            }
        }

        return role;
    }

    @Transactional
    public void deleteRole(String roleId) {
        Role role = roleRepo.selectById(roleId);
        if (role == null) return;
        if (Boolean.TRUE.equals(role.getIsSystem())) {
            throw new BusinessException(40011, "System roles cannot be deleted");
        }
        roleRepo.deleteById(roleId);
    }
}
