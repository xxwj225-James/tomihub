package com.ai_pm.core.controller;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.service.TenantMemberService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/tenant-members")
@RequiredArgsConstructor
@Validated
public class TenantMemberController {

    private final TenantMemberService memberService;

    @GetMapping
    public ApiResponse<List<Map<String, String>>> list() {
        String tenantId = TenantContextHolder.getTenantId();
        return ApiResponse.success(memberService.listMembersWithNames(tenantId));
    }

    @PutMapping("/{userId}/role")
    public ApiResponse<Void> updateRole(@PathVariable("userId") String userId,
                                         @RequestBody Map<String, String> body) {
        String tenantId = TenantContextHolder.getTenantId();
        String newRole = body.get("role");
        memberService.updateRole(tenantId, userId, newRole);
        return ApiResponse.success("Role updated to " + newRole, null);
    }

    @DeleteMapping("/{userId}")
    public ApiResponse<Void> remove(@PathVariable("userId") String userId) {
        String tenantId = TenantContextHolder.getTenantId();
        String currentUserId = TenantContextHolder.getUserId();

        String error = memberService.checkCanRemove(tenantId, currentUserId, userId);
        if (error != null) return ApiResponse.error(400, error);

        memberService.removeMember(tenantId, userId);
        return ApiResponse.success("Member removed", null);
    }

    @PutMapping("/{userId}/disable")
    public ApiResponse<Void> disable(@PathVariable("userId") String userId) {
        String tenantId = TenantContextHolder.getTenantId();
        String currentUserId = TenantContextHolder.getUserId();
        String error = memberService.checkCanManage(tenantId, currentUserId, userId);
        if (error != null) return ApiResponse.error(403, error);
        memberService.disableMember(tenantId, userId);
        return ApiResponse.success("Member disabled", null);
    }

    @PutMapping("/{userId}/enable")
    public ApiResponse<Void> enable(@PathVariable("userId") String userId) {
        String tenantId = TenantContextHolder.getTenantId();
        String currentUserId = TenantContextHolder.getUserId();
        String error = memberService.checkCanManage(tenantId, currentUserId, userId);
        if (error != null) return ApiResponse.error(403, error);
        memberService.enableMember(tenantId, userId);
        return ApiResponse.success("Member re-activated", null);
    }
}
