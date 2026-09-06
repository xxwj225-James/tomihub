package com.ai_pm.core.controller;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.security.RequirePermission;
import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.RoleRequest;
import com.ai_pm.core.dto.RoleVO;
import com.ai_pm.core.service.RoleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/roles")
@RequiredArgsConstructor
@Validated
public class RoleController {

    private final RoleService roleService;

    @GetMapping
    public ApiResponse<List<RoleVO>> list(@RequestParam(name = "scope", required = false) String scope) {
        String tenantId = TenantContextHolder.getTenantId();
        List<RoleVO> roles = scope != null
            ? roleService.listRolesByScope(tenantId, scope).stream().map(RoleVO::from).toList()
            : roleService.listRoles(tenantId).stream().map(RoleVO::from).toList();
        return ApiResponse.success(roles);
    }

    @PostMapping
    @RequirePermission("GLOBAL:ADMIN")
    public ApiResponse<RoleVO> create(@Valid @RequestBody RoleRequest.Create req) {
        String tenantId = TenantContextHolder.getTenantId();
        return ApiResponse.success(RoleVO.from(roleService.createRole(tenantId, req)));
    }

    @PutMapping("/{roleId}")
    @RequirePermission("GLOBAL:ADMIN")
    public ApiResponse<RoleVO> update(@PathVariable String roleId,
                                     @Valid @RequestBody RoleRequest.Update req) {
        return ApiResponse.success(RoleVO.from(roleService.updateRole(roleId, req)));
    }

    @DeleteMapping("/{roleId}")
    @RequirePermission("GLOBAL:ADMIN")
    public ApiResponse<Void> delete(@PathVariable String roleId) {
        roleService.deleteRole(roleId);
        return ApiResponse.success(null);
    }
}
