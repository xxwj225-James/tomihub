package com.ai_pm.core.controller;

import com.ai_pm.common.security.RequirePermission;
import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.RoleRequest;
import com.ai_pm.core.service.ProjectRoleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/projects/{projectId}")
@RequiredArgsConstructor
@Validated
public class ProjectRoleController {

    private final ProjectRoleService projectRoleService;

    /**
     * Assign a role to a project member.
     */
    @PostMapping("/members/{userId}/roles")
    @RequirePermission("PROJECT:ADMIN")
    public ApiResponse<Void> assignRole(@PathVariable String projectId,
                                         @PathVariable String userId,
                                         @Valid @RequestBody RoleRequest.AssignMember req) {
        projectRoleService.assignRole(projectId, userId, req.roleId());
        return ApiResponse.success(null);
    }

    /**
     * Revoke a role from a project member.
     */
    @DeleteMapping("/members/{userId}/roles/{roleId}")
    @RequirePermission("PROJECT:ADMIN")
    public ApiResponse<Void> revokeRole(@PathVariable String projectId,
                                         @PathVariable String userId,
                                         @PathVariable String roleId) {
        projectRoleService.revokeRole(projectId, userId, roleId);
        return ApiResponse.success(null);
    }

    /**
     * List roles for a project member.
     */
    @GetMapping("/members/{userId}/roles")
    @RequirePermission("PROJECT:BROWSE")
    public ApiResponse<List<String>> getUserRoles(@PathVariable String projectId,
                                                    @PathVariable String userId) {
        return ApiResponse.success(projectRoleService.getUserRoles(projectId, userId));
    }
}
