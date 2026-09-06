package com.ai_pm.auth.service;

import com.ai_pm.auth.entity.Invite;
import com.ai_pm.auth.entity.Tenant;
import com.ai_pm.auth.repository.InviteRepository;
import com.ai_pm.auth.repository.TenantRepository;
import com.ai_pm.auth.repository.UserRepository;
import com.ai_pm.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class InviteService {

    private static final SecureRandom RNG = new SecureRandom();

    private final InviteRepository inviteRepo;
    private final TenantRepository tenantRepo;
    private final UserRepository userRepo;
    private final EmailService emailService;

    public List<Invite> listByTenant(String tenantId) {
        return inviteRepo.findByTenantId(tenantId);
    }

    @Transactional
    public Invite create(String tenantId, String userId, String email, String role) {
        if (email == null || email.isBlank()) {
            throw new BusinessException(40000, "Email is required");
        }
        if (userRepo.isMemberOfTenant(email, tenantId)) {
            throw new BusinessException(40000, "This email is already in this workspace");
        }
        if (inviteRepo.existsPendingByEmailAndTenant(email, tenantId)) {
            throw new BusinessException(40000, "An active invite already exists for this email");
        }

        Invite invite = new Invite();
        invite.setTenantId(tenantId);
        invite.setEmail(email.trim().toLowerCase());
        invite.setRole(role);
        invite.setInvitedBy(userId);
        invite.setCode(generateCode());
        invite.setExpiresAt(Instant.now().plus(7, ChronoUnit.DAYS));
        invite.setStatus("pending");
        inviteRepo.insert(invite);
        return invite;
    }

    /**
     * Attempt to send invite email. Returns true if sent successfully, false otherwise.
     * Does NOT delete the invite on failure — caller handles that.
     */
    public boolean sendInviteEmail(Invite invite, String tenantId) {
        Tenant tenant = tenantRepo.findById(tenantId).orElse(null);
        String workspaceName = tenant != null ? tenant.getName() : "TomiHub";
        try {
            emailService.sendInviteEmail(invite.getEmail(), workspaceName, invite.getRole(), invite.getCode());
            return true;
        } catch (Exception e) {
            log.warn("Failed to send invite email: {}", e.getMessage());
            return false;
        }
    }

    public String generateCode() {
        byte[] bytes = new byte[24];
        RNG.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
