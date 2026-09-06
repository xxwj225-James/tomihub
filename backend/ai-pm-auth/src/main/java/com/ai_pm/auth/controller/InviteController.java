package com.ai_pm.auth.controller;

import com.ai_pm.auth.dto.InviteVO;
import com.ai_pm.auth.entity.Invite;
import com.ai_pm.auth.entity.Tenant;
import com.ai_pm.auth.repository.InviteRepository;
import com.ai_pm.auth.repository.TenantRepository;
import com.ai_pm.auth.repository.UserRepository;
import com.ai_pm.auth.service.AuthService;
import com.ai_pm.auth.service.InviteService;
import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.common.repository.TenantMemberRepository;
import com.ai_pm.common.web.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/v1/invites")
@RequiredArgsConstructor
@Validated
public class InviteController {

    private final InviteService inviteService;
    private final InviteRepository inviteRepo;
    private final TenantRepository tenantRepo;
    private final UserRepository userRepo;
    private final AuthService authService;
    private final TenantMemberRepository tenantMemberRepo;

    /**
     * Invites write tenant data — read-only users (viewer role / demo workspace)
     * are rejected, mirroring the ai-brain read-only guard.
     */
    private void verifyCanInvite(String tenantId) {
        String userId = TenantContextHolder.getUserId();
        if (userId != null) {
            var member = tenantMemberRepo.findByTenantIdAndUserId(tenantId, userId);
            if (member.isPresent() && "viewer".equals(member.get().getRole())) {
                throw new BusinessException(40300, "Read-only account — you cannot send invites", HttpStatus.FORBIDDEN);
            }
        }
        Tenant t = tenantRepo.findById(tenantId).orElse(null);
        if (t != null && "demo-workspace".equals(t.getSlug())) {
            throw new BusinessException(40300, "Read-only account — you cannot send invites", HttpStatus.FORBIDDEN);
        }
    }

    @GetMapping
    public ApiResponse<List<InviteVO>> list() {
        String tenantId = TenantContextHolder.getTenantId();
        return ApiResponse.success(inviteService.listByTenant(tenantId).stream().map(InviteVO::from).toList());
    }

    @PostMapping
    public ApiResponse<InviteVO> create(@RequestBody Map<String, String> body) {
        String tenantId = TenantContextHolder.getTenantId();
        verifyCanInvite(tenantId);
        String userId = TenantContextHolder.getUserId();
        String email = body.get("email");
        String role = body.getOrDefault("role", "member");

        try { authService.enforceSeatQuota(tenantId); } catch (BusinessException ex) {
            return ApiResponse.error(403, ex.getMessage());
        }

        Invite invite;
        try {
            invite = inviteService.create(tenantId, userId, email, role);
        } catch (BusinessException e) {
            return ApiResponse.error(400, e.getMessage());
        }

        // Send invite email
        boolean emailSent = inviteService.sendInviteEmail(invite, tenantId);
        if (!emailSent) {
            inviteRepo.deleteById(invite.getId());
        }

        InviteVO inviteVO = InviteVO.from(invite);
        return emailSent
            ? ApiResponse.success("Invite created and email sent", inviteVO)
            : ApiResponse.success("Invite created but email failed", inviteVO);
    }

    @PostMapping("/batch")
    public ApiResponse<Map<String, Object>> createBatch(@RequestBody Map<String, Object> body) {
        String tenantId = TenantContextHolder.getTenantId();
        verifyCanInvite(tenantId);
        @SuppressWarnings("unchecked")
        List<String> emails = (List<String>) body.getOrDefault("emails", List.of());
        String role = (String) body.getOrDefault("role", "member");

        if (emails.isEmpty()) return ApiResponse.error(400, "At least one email is required");
        // Check seat quota before inviting
        try { authService.enforceSeatQuota(tenantId); } catch (BusinessException ex) {
            return ApiResponse.error(403, ex.getMessage());
        }

        int sent = 0, failed = 0, skipped = 0;
        List<Map<String, String>> results = new ArrayList<>();

        for (String email : emails) {
            String e = email.trim().toLowerCase();
            if (e.isBlank()) continue;
            if (!e.matches(".+@.+\\..+")) {
                results.add(Map.of("email", e, "status", "skipped", "reason", "Invalid email format"));
                skipped++; continue;
            }
            if (userRepo.isMemberOfTenant(e, tenantId)) {
                results.add(Map.of("email", e, "status", "skipped", "reason", "Already in workspace"));
                skipped++; continue;
            }
            if (inviteRepo.existsPendingByEmailAndTenant(e, tenantId)) {
                results.add(Map.of("email", e, "status", "skipped", "reason", "Already invited"));
                skipped++; continue;
            }

            try {
                Invite invite = inviteService.create(tenantId, TenantContextHolder.getUserId(), e, role);
                boolean ok = inviteService.sendInviteEmail(invite, tenantId);
                if (ok) {
                    results.add(Map.of("email", e, "status", "sent"));
                    sent++;
                } else {
                    inviteRepo.deleteById(invite.getId());
                    results.add(Map.of("email", e, "status", "failed", "reason", "Email send failed"));
                    failed++;
                }
            } catch (BusinessException ex) {
                results.add(Map.of("email", e, "status", "failed", "reason", ex.getMessage() != null ? ex.getMessage() : "unknown"));
                failed++;
            }
        }

        Map<String, Object> summary = new HashMap<>();
        summary.put("total", emails.size());
        summary.put("sent", sent);
        summary.put("failed", failed);
        summary.put("skipped", skipped);
        summary.put("results", results);
        return ApiResponse.success("Batch: " + sent + " sent, " + failed + " failed, " + skipped + " skipped", summary);
    }

    @GetMapping("/lookup")
    public ApiResponse<Map<String, Object>> lookup(@RequestParam("code") String code) {
        Invite invite = inviteRepo.findByCode(code)
            .orElseThrow(() -> new RuntimeException("Invalid or expired invite code"));

        if (!"pending".equals(invite.getStatus())) {
            throw new RuntimeException("Invite already used or expired");
        }
        if (invite.getExpiresAt() != null && invite.getExpiresAt().isBefore(Instant.now())) {
            throw new RuntimeException("Invite has expired");
        }

        Tenant tenant = tenantRepo.findById(invite.getTenantId())
            .orElseThrow(() -> new RuntimeException("Workspace not found"));

        Map<String, Object> data = new HashMap<>();
        data.put("email", invite.getEmail());
        data.put("role", invite.getRole());
        data.put("workspaceName", tenant.getName());
        data.put("isExistingUser", userRepo.existsByEmail(invite.getEmail()));
        return ApiResponse.success(data);
    }
}
