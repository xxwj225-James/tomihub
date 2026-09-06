package com.ai_pm.auth.service;

import com.ai_pm.auth.entity.Tenant;
import com.ai_pm.auth.entity.User;
import com.ai_pm.common.entity.TenantMember;
import com.ai_pm.auth.repository.*;
import com.ai_pm.common.repository.TenantMemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantProvisioningService {

    private final TenantRepository tenantRepo;
    private final UserRepository userRepo;
    private final TenantMemberRepository memberRepo;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    /**
     * Mode B: Admin provisions a new tenant with an initial admin account.
     */
    @Transactional
    public ProvisionResult provisionTenant(ProvisionRequest req) {
        // 1. Create tenant
        Tenant tenant = new Tenant();
        tenant.setName(req.companyName());
        tenant.setSlug(req.slug());
        tenant.setPlan(req.plan() != null ? req.plan() : "pro");
        tenant.setRegistrationMode("invite_only");
        tenant.setIsActive(true);
        tenantRepo.insert(tenant);

        // 2. Check if admin user already exists
        User admin = userRepo.findByEmail(req.adminEmail()).orElse(null);

        String tempPassword = null;
        boolean isNewUser = (admin == null);

        if (isNewUser) {
            // 3a. Create new admin user
            tempPassword = generateTempPassword();
            admin = new User();
            admin.setEmail(req.adminEmail().toLowerCase().trim());
            admin.setPasswordHash(passwordEncoder.encode(tempPassword));
            admin.setDisplayName(req.adminName());
            admin.setEmailVerified(false);
            admin.setStatus("active");
            userRepo.insert(admin);
        }

        // 3b. Add as tenant member with admin role
        TenantMember member = new TenantMember();
        member.setTenantId(tenant.getId());
        member.setUserId(admin.getId());
        member.setRole("admin");
        memberRepo.insert(member);

        log.info("Tenant provisioned: {} (slug={}), admin={}, newUser={}",
                 tenant.getName(), tenant.getSlug(), req.adminEmail(), isNewUser);

        return new ProvisionResult(
            tenant.getId(), tenant.getName(), tenant.getSlug(),
            req.adminEmail(), tempPassword, isNewUser
        );
    }

    private String generateTempPassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        StringBuilder sb = new StringBuilder(12);
        for (int i = 0; i < 12; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }

    public record ProvisionRequest(
        String companyName,
        String slug,
        String adminEmail,
        String adminName,
        String plan
    ) {}

    public record ProvisionResult(
        String tenantId,
        String tenantName,
        String slug,
        String adminEmail,
        String tempPassword,
        boolean isNewUser
    ) {}
}
