package com.ai_pm.auth.controller;

import com.ai_pm.common.entity.TenantMember;
import com.ai_pm.common.repository.TenantMemberRepository;
import com.ai_pm.common.web.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/members")
@RequiredArgsConstructor
@Validated
public class MemberApprovalController {

    private final TenantMemberRepository memberRepo;

    @GetMapping("/pending")
    public ApiResponse<List<TenantMember>> listPending(@RequestHeader("X-Tenant-Id") String tenantId) {
        return ApiResponse.success(memberRepo.findByTenantIdAndRole(tenantId, "pending"));
    }

    @PostMapping("/{userId}/approve")
    public ApiResponse<Void> approve(@RequestHeader("X-Tenant-Id") String tenantId,
                                      @PathVariable String userId) {
        memberRepo.updateRole(tenantId, userId, "pending", "member");
        return ApiResponse.success(null);
    }

    @PostMapping("/{userId}/deny")
    public ApiResponse<Void> deny(@RequestHeader("X-Tenant-Id") String tenantId,
                                   @PathVariable String userId) {
        memberRepo.deleteByTenantAndUser(tenantId, userId);
        return ApiResponse.success(null);
    }
}
