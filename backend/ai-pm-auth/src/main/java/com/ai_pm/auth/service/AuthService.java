package com.ai_pm.auth.service;

import com.ai_pm.auth.dto.*;
import com.ai_pm.auth.entity.Invite;
import com.ai_pm.auth.entity.JoinLink;
import com.ai_pm.auth.entity.Tenant;
import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.entity.TenantMember;
import com.ai_pm.auth.entity.User;
import com.ai_pm.auth.repository.*;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.common.repository.TenantMemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepo;
    private final TenantRepository tenantRepo;
    private final TenantMemberRepository memberRepo;
    private final JdbcTemplate jdbc;
    private final InviteRepository inviteRepo;
    private final JoinLinkRepository joinLinkRepo;
    private final VerificationCodeService codeService;
    private final TokenService tokenService;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    // Demo operator admin — seeded lazily by guestLogin() once the demo tenant
    // exists. Email is a NORMAL (non-@tomihub.demo) address so the frontend's
    // isDemoUser check doesn't hide the admin area; password is env-only
    // (AI-BOUNDARY — never hardcoded), defaulting to "no admin" when unset.
    @Value("${DEMO_ADMIN_EMAIL:admin@tomihub.local}")
    private String demoAdminEmail;

    @Value("${DEMO_ADMIN_PASSWORD:}")
    private String demoAdminPassword;

    // Demo user email suffix. Cloud AI demo: @tomihub.demo (frontend treats it
    // as the AI-demo user). No-AI open edition: @demo.local. Env AIPM_/DEMO_
    // prefix is mapped by Spring (env DEMO_EMAIL_SUFFIX).
    @Value("${DEMO_EMAIL_SUFFIX:@tomihub.demo}")
    private String demoEmailSuffixValue;

    private String demoEmailSuffix() {
        return (demoEmailSuffixValue == null || demoEmailSuffixValue.isBlank())
            ? "@tomihub.demo" : demoEmailSuffixValue.startsWith("@")
                ? demoEmailSuffixValue : "@" + demoEmailSuffixValue;
    }

    // === Registration ===

    @Transactional
    public AuthResponse register(AuthRequest.Register req) {
        String email = req.email().toLowerCase().trim();

        boolean isInvited = req.inviteCode() != null && !req.inviteCode().isBlank();

        // 1. Check email — if already registered with valid invite, rejoin workspace
        if (userRepo.existsByEmail(email)) {
            if (!isInvited) {
                throw new BusinessException(40001, "Email already registered");
            }
            // Registered user rejoining via invite — validate password then add to workspace
            User existingUser = userRepo.findByEmail(email).get();
            // Skip password check if already authenticated (JWT present)
            String currentUserId = TenantContextHolder.getUserId();
            if (currentUserId == null || !currentUserId.equals(existingUser.getId())) {
                if (!passwordEncoder.matches(req.password(), existingUser.getPasswordHash())) {
                    throw new BusinessException(40002, "Invalid password");
                }
                // Auto-migrate legacy hash
                if (passwordEncoder.upgradeEncoding(existingUser.getPasswordHash())) {
                    existingUser.setPasswordHash(passwordEncoder.encode(req.password()));
                    log.info("Password hash upgraded during rejoin: userId={}", existingUser.getId());
                }
            }
            return handleRejoinViaInvite(existingUser, req.inviteCode(), email);
        }

        // 2. Verify email code — only when inviteCode NOT present (invite itself verifies email)
        if (!isInvited && req.code() != null && !req.code().isBlank()) {
            codeService.verifyCode(email, req.code(), "register");
        }

        // 3. Validate password strength
        validatePassword(req.password());

        // 4. Create user
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setDisplayName(req.displayName());
        // Self-signup: auto-verified. Invited: verified after code check above.
        user.setEmailVerified(true);
        user.setInvited(isInvited);
        user.setStatus("active");
        userRepo.insert(user);

        // 5. Resolve tenant
        Tenant tenant;
        String role;
        boolean isFirstUser = false;

        log.info("Register: email={}, isInvited={}, inviteCode={}", email, isInvited, req.inviteCode());
        if (req.inviteCode() != null && !req.inviteCode().isBlank()) {
            // Join via personal invite (one-time, email-specific)
            log.info("Processing invite: code={}", req.inviteCode());
            Invite invite = inviteRepo.findByCode(req.inviteCode())
                .orElseThrow(() -> new BusinessException(40006, "Invalid invite code"));
            if (!"pending".equals(invite.getStatus())) {
                throw new BusinessException(40007, "Invite code already used or expired");
            }
            if (invite.getExpiresAt() != null && invite.getExpiresAt().isBefore(Instant.now())) {
                throw new BusinessException(40008, "Invite code expired");
            }
            if (!invite.getEmail().equalsIgnoreCase(email)) {
                throw new BusinessException(40009, "Invite email does not match registration email");
            }
            tenant = tenantRepo.findById(invite.getTenantId())
                .orElseThrow(() -> new BusinessException(50000, "Tenant not found"));
            role = invite.getRole();
            invite.setStatus("accepted");
            invite.setAcceptedAt(Instant.now());
            inviteRepo.updateById(invite);
            // Notify inviter that invitee has joined
            notifyInviter(invite, tenant.getId(), user, tenant.getName());
        } else if (req.joinLink() != null && !req.joinLink().isBlank()) {
            // Join via reusable join link (anyone with the link)
            JoinLink link = joinLinkRepo.findByCode(req.joinLink())
                .orElseThrow(() -> new BusinessException(40010, "Invalid join link"));
            if (!link.getIsActive()) {
                throw new BusinessException(40011, "Join link is no longer active");
            }
            if (link.getExpiresAt() != null && link.getExpiresAt().isBefore(Instant.now())) {
                throw new BusinessException(40012, "Join link has expired");
            }
            if (link.getMaxUses() != null && link.getUseCount() >= link.getMaxUses()) {
                throw new BusinessException(40013, "Join link has reached maximum uses");
            }
            tenant = tenantRepo.findById(link.getTenantId())
                .orElseThrow(() -> new BusinessException(50000, "Tenant not found"));
            role = link.getRole();
            link.setUseCount(link.getUseCount() + 1);
            joinLinkRepo.updateById(link);

            // If approval required → use "pending" role, admin must approve
            if (Boolean.TRUE.equals(link.getRequiresApproval())) {
                role = "pending";
            }
        } else {
            // Auto-create personal workspace — check tenant quota
            enforceTenantQuota();
            isFirstUser = true;
            String slug = generateSlug(req.displayName());
            tenant = new Tenant();
            String wsName = req.workspaceName() != null && !req.workspaceName().isBlank()
                ? req.workspaceName().trim() : req.displayName() + "'s Workspace";
            tenant.setName(wsName);
            tenant.setSlug(slug);
            tenant.setPlan("free");
            tenant.setRegistrationMode("open");
            tenant.setIsActive(true);
            tenantRepo.insert(tenant);
            role = "owner";
        }

        // 6. Check seat quota before adding
        enforceSeatQuota(tenant.getId());

        // 7. Add user as tenant member
        TenantMember member = new TenantMember();
        member.setTenantId(tenant.getId());
        member.setUserId(user.getId());
        member.setRole(role);
        String mid = java.util.UUID.randomUUID().toString().replace("-", "");
        jdbc.update("INSERT INTO tenant_members (id, tenant_id, user_id, role, joined_at) VALUES (?,?,?,?,NOW())",
            mid, tenant.getId(), user.getId(), role);
        log.info("Tenant member inserted via JDBC: id={}, tenant={}, user={}, role={}", mid, tenant.getId(), user.getId(), role);

        // 7. Issue tokens (single tenant → full scope directly)
        TokenPair tokens = tokenService.issueFullScopeTokens(user, tenant.getId());
        tokenService.storeRefreshToken(user.getId(), tokens.refreshToken(),
            "Registration", null);

        log.info("User registered: email={}, userId={}, tenant={}, isFirstUser=true",
                 email, user.getId(), tenant.getId());

        return new AuthResponse(
            UserVO.from(user), tokens,
            List.of(TenantVO.from(tenant, role)),
            TenantVO.from(tenant, role),
            false, isFirstUser
        );
    }

    /** Rejoin workspace via invite — user already exists, just validate invite & add to tenant. */
    private void notifyInviter(Invite invite, String tenantId, User invitee, String workspaceName) {
        try {
            // Look up inviter
            User inviter = userRepo.findById(invite.getInvitedBy()).orElse(null);
            if (inviter == null) return;

            // Send celebration email
            try {
                emailService.sendInviteAccepted(inviter.getEmail(), invitee.getDisplayName(), workspaceName);
            } catch (Exception e) {
                log.warn("Failed to send invite-accepted email to {}: {}", inviter.getEmail(), e.getMessage());
            }

            // Insert system notification
            String notifId = java.util.UUID.randomUUID().toString().replace("-", "");
            jdbc.update(
                "INSERT INTO notifications (id, tenant_id, type, title, body, target_user_id, source_user_id, source_agent, action_type, status, created_at) " +
                "VALUES (?,?,?,?,?,?,?,?,?,?,NOW())",
                notifId, tenantId, "member_joined",
                "🎉 " + invitee.getDisplayName() + " has joined " + workspaceName,
                "Your invited member " + invitee.getDisplayName() + " (" + invitee.getEmail() + ") has completed registration and joined the workspace.",
                inviter.getId(), invitee.getId(), "system", "none", "delivered"
            );
            log.info("Invite-accepted notification sent to inviter {} for invitee {}", inviter.getId(), invitee.getId());
        } catch (Exception e) {
            log.warn("Failed to notify inviter: {}", e.getMessage());
        }
    }

    private void enforceTenantQuota() {
        int tenantCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM tenants WHERE is_active = true", Integer.class);
        int maxTenants = getConfigInt("license.max_tenants", 100);
        if (tenantCount >= maxTenants) {
            throw new BusinessException(40300, "Tenant quota reached (" + maxTenants + "). Contact admin to upgrade your license.");
        }
    }

    public void enforceSeatQuota(String tenantId) {
        int seatCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM tenant_members WHERE tenant_id = ? AND status != 'disabled'", Integer.class, tenantId);
        int maxSeats = getConfigInt("license.max_seats_per_tenant", 50);
        if (seatCount >= maxSeats) {
            throw new BusinessException(40300, "Seat quota reached (" + maxSeats + " per workspace). Contact admin to upgrade your license.");
        }
    }

    private int getConfigInt(String key, int defaultValue) {
        try {
            Integer val = jdbc.queryForObject(
                "SELECT value FROM system_configs WHERE key = ?", Integer.class, key);
            return val != null ? val : defaultValue;
        } catch (Exception e) { return defaultValue; }
    }

    private AuthResponse handleRejoinViaInvite(User user, String inviteCode, String email) {
        Invite invite = inviteRepo.findByCode(inviteCode)
            .orElseThrow(() -> new BusinessException(40006, "Invalid invite code"));
        if (!"pending".equals(invite.getStatus()))
            throw new BusinessException(40007, "Invite already used or expired");
        if (invite.getExpiresAt() != null && invite.getExpiresAt().isBefore(Instant.now()))
            throw new BusinessException(40008, "Invite code expired");
        if (!invite.getEmail().equalsIgnoreCase(email))
            throw new BusinessException(40009, "Invite email mismatch");

        Tenant tenant = tenantRepo.findById(invite.getTenantId())
            .orElseThrow(() -> new BusinessException(50000, "Tenant not found"));

        if (memberRepo.findByTenantIdAndUserId(tenant.getId(), user.getId()).isPresent())
            throw new BusinessException(40020, "Already a member of this workspace");

        TenantMember member = new TenantMember();
        member.setTenantId(tenant.getId());
        member.setUserId(user.getId());
        member.setRole(invite.getRole());
        member.setId(java.util.UUID.randomUUID().toString().replace("-", ""));
        memberRepo.insertMember(member);

        invite.setStatus("accepted");
        invite.setAcceptedAt(Instant.now());
        inviteRepo.updateById(invite);

        TokenPair tokens = tokenService.issueFullScopeTokens(user, tenant.getId());
        tokenService.storeRefreshToken(user.getId(), tokens.refreshToken(), "Rejoin", null);

        log.info("User rejoined workspace via invite: email={}, tenant={}", email, tenant.getId());
        return new AuthResponse(
            UserVO.from(user), tokens,
            List.of(TenantVO.from(tenant, invite.getRole())),
            TenantVO.from(tenant, invite.getRole()),
            false
        );
    }

    // === Login (Two-Stage) ===

    @Transactional
    public AuthResponse login(AuthRequest.Login req, String ip, String userAgent) {
        String email = req.email().toLowerCase().trim();

        // 1. Find user
        User user = userRepo.findByEmail(email)
            .orElseThrow(() -> new BusinessException(40101, "Invalid email or password"));

        // 2. Check account status
        if ("disabled".equals(user.getStatus())) {
            throw new BusinessException(40301, "Account disabled", HttpStatus.FORBIDDEN);
        }

        // 3. Check lock
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now())) {
            long minutes = Duration.between(Instant.now(), user.getLockedUntil()).toMinutes();
            throw new BusinessException(42301, "Account locked. Retry after " + minutes + "minutes",
                HttpStatus.LOCKED);
        }

        // 4. Verify password
        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            handleFailedLogin(user);
            throw new BusinessException(40101, "Invalid email or password");
        }

        // 4a. Auto-migrate legacy (unencrypted) BCrypt hash to AES-encrypted format
        if (passwordEncoder.upgradeEncoding(user.getPasswordHash())) {
            user.setPasswordHash(passwordEncoder.encode(req.password()));
            log.info("Password hash upgraded to AES-encrypted format: userId={}", user.getId());
        }

        // 5. Reset failure count
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(Instant.now());
        user.setLastLoginIp(ip);
        userRepo.updateById(user);

        // 6. Load tenants
        List<TenantMember> memberships = memberRepo.findByUserId(user.getId());
        List<TenantVO> tenants = memberships.stream().map(m -> {
            Tenant t = tenantRepo.findById(m.getTenantId())
                .orElseThrow(() -> new IllegalStateException("Tenant not found"));
            return TenantVO.from(t, m.getRole());
        }).toList();

        if (tenants.isEmpty()) {
            throw new BusinessException(50001, "Account has no workspace");
        }

        // 7. ★ Two-stage token issuance
        TokenPair tokens;
        TenantVO currentTenant;
        boolean requireSelection;

        if (tenants.size() == 1) {
            // Single tenant → full-scope token directly
            tokens = tokenService.issueFullScopeTokens(user, tenants.getFirst().id());
            currentTenant = tenants.getFirst();
            requireSelection = false;
        } else {
            // ★ Multiple tenants → pre-tenant token (tenant_id=null, scope=tenant_selection)
            tokens = tokenService.issuePreTenantTokens(user, req.rememberMe());
            currentTenant = null;
            requireSelection = true;
        }

        tokenService.storeRefreshToken(user.getId(), tokens.refreshToken(),
            userAgent, ip);

        log.info("User logged in: email={}, tenants={}, requireSelection={}",
            email, tenants.size(), requireSelection);

        return new AuthResponse(
            UserVO.from(user), tokens, tenants, currentTenant, requireSelection
        );
    }

    // === Tenant Selection ===

    @Transactional
    public AuthResponse selectTenant(String userId, String tenantId) {
        // Verify membership
        TenantMember member = memberRepo.findByTenantIdAndUserId(tenantId, userId)
            .orElseThrow(() -> new BusinessException(40303, "You are not a member of this workspace",
                HttpStatus.FORBIDDEN));

        User user = userRepo.findById(userId)
            .orElseThrow(() -> new BusinessException(50000, "User not found"));

        Tenant tenant = tenantRepo.findById(tenantId)
            .orElseThrow(() -> new BusinessException(50000, "Workspace not found"));

        // ★ Issue full-scope token
        TokenPair tokens = tokenService.issueFullScopeTokens(user, tenantId);
        tokenService.storeRefreshToken(userId, tokens.refreshToken(),
            "TenantSelection", null);

        return new AuthResponse(
            UserVO.from(user), tokens,
            List.of(TenantVO.from(tenant, member.getRole())),
            TenantVO.from(tenant, member.getRole()),
            false
        );
    }

    // === Profile Update ===

    @Transactional
    public UserVO updateProfile(String userId, UpdateProfileRequest req) {
        User user = userRepo.findById(userId)
            .orElseThrow(() -> new BusinessException(40401, "User not found"));

        if (req.displayName() != null) user.setDisplayName(req.displayName());
        if (req.jobTitle() != null) user.setJobTitle(req.jobTitle());
        if (req.skills() != null) user.setSkills(req.skills());
        if (req.gender() != null) user.setGender(req.gender());
        if (req.aiLanguage() != null) user.setAiLanguage(req.aiLanguage());
        if (req.uiLanguage() != null) user.setUiLanguage(req.uiLanguage());
        if (req.onboardingCompleted() != null) user.setOnboardingCompleted(req.onboardingCompleted());

        userRepo.updateById(user);
        log.info("Profile updated: userId={}", userId);
        return UserVO.from(user);
    }

    // === Logout ===

    @Transactional
    public void logout(String userId, String rawRefreshToken) {
        if (rawRefreshToken != null && !rawRefreshToken.isBlank()) {
            tokenService.revokeToken(rawRefreshToken);
        } else {
            tokenService.revokeUserTokens(userId);
        }
    }

    // === Password Validation ===

    private void validatePassword(String password) {
        if (password == null || password.length() < 8) {
            throw new BusinessException(40003, "Password must be at least 8 characters");
        }
        if (!password.matches(".*[a-z].*")) {
            throw new BusinessException(40003, "Password must contain lowercase letter");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new BusinessException(40003, "Password must contain uppercase letter");
        }
        if (!password.matches(".*\\d.*")) {
            throw new BusinessException(40003, "Password must contain digit");
        }
    }

    private void handleFailedLogin(User user) {
        int attempts = user.getFailedLoginAttempts() + 1;
        user.setFailedLoginAttempts(attempts);
        if (attempts >= 5) {
            user.setLockedUntil(Instant.now().plus(Duration.ofMinutes(15)));
            log.warn("Account locked: userId={}, email={}, attempts={}",
                user.getId(), user.getEmail(), attempts);
        }
        userRepo.updateById(user);
    }

    /** Demo guest login — creates/reuses a shared demo account with viewer access. */
    @Transactional
    public AuthResponse guestLogin() {
        // Demo identity is env-driven so the cloud AI demo and the no-AI open
        // edition differ: the AI demo uses @tomihub.demo (frontend treats that
        // suffix as an AI-demo user → quotas/banners), while the open edition
        // sets AIPM_DEMO_EMAIL_SUFFIX=@demo.local so the same "Try demo" path
        // yields a plain PM demo with no AI-demo chrome.
        String demoSuffix = demoEmailSuffix();
        String demoEmail = "demo" + demoSuffix;
        String demoTenantName = "Demo Workspace";
        String demoTenantSlug = "demo-workspace";
        // Public demo guest password — intentionally known (anyone may try the
        // demo). The demo workspace is read-only (ViewerWriteGuard) and
        // per-IP quota'd; never reuse this credential in a real deployment.
        String demoPassword = "Demo@2026!";
        String uuid = java.util.UUID.randomUUID().toString().replace("-", "");

        // Find or create demo user
        User demoUser = userRepo.findByEmail(demoEmail).orElse(null);
        if (demoUser != null) {
            // Ensure existing demo user has onboarding completed
            if (!Boolean.TRUE.equals(demoUser.getOnboardingCompleted())) {
                demoUser.setOnboardingCompleted(true);
                userRepo.updateById(demoUser);
            }
        } else {
            demoUser = new User();
            demoUser.setId(uuid.substring(0, 32));
            demoUser.setEmail(demoEmail);
            demoUser.setPasswordHash(passwordEncoder.encode(demoPassword));
            demoUser.setDisplayName("Demo User");
            demoUser.setEmailVerified(true);
            demoUser.setStatus("active");
            demoUser.setUiLanguage("zh");
            demoUser.setAiLanguage("zh");
            demoUser.setOnboardingCompleted(true);
            userRepo.insert(demoUser);
        }

        // Find or create demo tenant
        String existingTenantId = null;
        try {
            existingTenantId = jdbc.queryForObject(
                "SELECT id FROM tenants WHERE slug = ?", String.class, demoTenantSlug);
        } catch (Exception ignored) { /* tenant doesn't exist yet */ }
        Tenant demoTenant = existingTenantId != null ? tenantRepo.selectById(existingTenantId) : null;
        if (demoTenant == null) {
            String tid = uuid.substring(0, 32);
            jdbc.update(
                "INSERT INTO tenants (id, name, slug, plan, is_active, created_at, updated_at) VALUES (?,?,?,?,?,NOW(),NOW())",
                tid, demoTenantName, demoTenantSlug, "free", true
            );
            demoTenant = new Tenant();
            demoTenant.setId(tid);
            demoTenant.setName(demoTenantName);
            demoTenant.setSlug(demoTenantSlug);
        }

        // ---- Demo operator admin (manage the demo: LLM keys, members, etc.) ----
        // Seeded lazily here because the demo tenant only exists after a
        // guest-login. A NORMAL (non-@tomihub.demo) email so the frontend's
        // isDemoUser check doesn't hide the admin area, and tenant role 'owner'
        // so the admin route guards let it through. The password is seeded only
        // at creation — afterwards it can be changed in the UI and is never
        // clobbered by a re-run. When DEMO_ADMIN_PASSWORD is unset the demo
        // still works visitor-only, just no operator account.
        User adminUser = null;
        if (!demoAdminEmail.isBlank() && !demoAdminEmail.equalsIgnoreCase(demoEmail)
                && !demoAdminPassword.isBlank()) {
            adminUser = userRepo.findByEmail(demoAdminEmail).orElse(null);
            if (adminUser == null) {
                adminUser = new User();
                adminUser.setId(java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 32));
                adminUser.setEmail(demoAdminEmail);
                adminUser.setPasswordHash(passwordEncoder.encode(demoAdminPassword));
                adminUser.setDisplayName("Demo Admin");
                adminUser.setEmailVerified(true);
                adminUser.setStatus("active");
                adminUser.setUiLanguage("zh");
                adminUser.setAiLanguage("zh");
                adminUser.setOnboardingCompleted(true);
                userRepo.insert(adminUser);
                log.info("Demo admin seeded: email={}", demoAdminEmail);
            }
            // Ensure the admin owns the demo tenant (upsert to 'owner').
            String adminRole = null;
            try {
                adminRole = jdbc.queryForObject(
                    "SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?",
                    String.class, demoTenant.getId(), adminUser.getId());
            } catch (Exception ignored) { /* not a member yet */ }
            if (adminRole == null) {
                jdbc.update(
                    "INSERT INTO tenant_members (id, tenant_id, user_id, role, joined_at) VALUES (?,?,?,?,NOW())",
                    java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 32),
                    demoTenant.getId(), adminUser.getId(), "owner");
            } else if (!"owner".equals(adminRole)) {
                jdbc.update(
                    "UPDATE tenant_members SET role = 'owner' WHERE tenant_id = ? AND user_id = ?",
                    demoTenant.getId(), adminUser.getId());
            }
        } else {
            log.warn("DEMO_ADMIN_PASSWORD unset — no operator admin seeded (demo runs visitor-only)");
        }

        // Reset shared demo experience state so every visitor starts fresh:
        // notifications back to unread, chat history cleared (frontend keeps
        // demo chat local per browser, so persisted history is stale anyway).
        try {
            jdbc.update(
                "UPDATE notifications SET read_at = NULL WHERE tenant_id = ? AND read_at IS NOT NULL",
                demoTenant.getId());
            jdbc.update(
                "DELETE FROM ai_chat_messages WHERE session_id IN (SELECT id FROM ai_chat_sessions WHERE user_id = ?)",
                demoUser.getId());
            jdbc.update(
                "DELETE FROM ai_chat_sessions WHERE user_id = ?",
                demoUser.getId());
        } catch (Exception ignored) {
            // Chat tables may not exist on fresh installs — non-fatal
        }

        // Create demo project with rich sample data
        String demoProjectKey = "DEMO";
        Integer projectCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM projects WHERE tenant_id = ? AND key = ?",
            Integer.class, demoTenant.getId(), demoProjectKey);
        String demoProjectId = uuid.substring(16, 32);
        if (projectCount == null || projectCount == 0) {
            jdbc.update(
                "INSERT INTO projects (id, tenant_id, name, key, description, phase, visibility, status, created_at, updated_at) " +
                "VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())",
                demoProjectId, demoTenant.getId(), "TomiHub Mobile App", demoProjectKey,
                "A cross-platform mobile application for personal productivity — task management, notes, AI assistant, and Git integration.",
                "development", "private", "active"
            );
            // Add demo user as project member (member — demo is writable so
            // visitors can create issues, move boards, etc.)
            jdbc.update(
                "INSERT INTO project_members (id, project_id, user_id, role, joined_at) VALUES (?,?,?,?,NOW())",
                java.util.UUID.randomUUID().toString().replace("-", ""), demoProjectId, demoUser.getId(), "member"
            );

            // Create a default workflow for demo project if not exists
            String workflowId = null;
            try {
                workflowId = jdbc.queryForObject(
                    "SELECT id FROM workflows WHERE tenant_id = ? AND is_default = true LIMIT 1",
                    String.class, demoTenant.getId());
            } catch (Exception ignored) {}
            if (workflowId == null) {
                workflowId = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 32);
                jdbc.update(
                    "INSERT INTO workflows (id, tenant_id, name, description, states, transitions, is_default, created_at) " +
                    "VALUES (?,?,?,?,?::jsonb,?::jsonb,?,NOW())",
                    workflowId, demoTenant.getId(), "Default",
                    "Standard workflow: Todo, In Progress, In Review, Done",
                    "[{\"key\":\"todo\",\"name\":\"Todo\"},{\"key\":\"in_progress\",\"name\":\"In Progress\"},{\"key\":\"in_review\",\"name\":\"In Review\"},{\"key\":\"done\",\"name\":\"Done\"}]",
                    "[{\"from\":\"todo\",\"to\":\"in_progress\"},{\"from\":\"in_progress\",\"to\":\"in_review\"},{\"from\":\"in_review\",\"to\":\"done\"}]",
                    true
                );
            }

            // ---- Demo Issues (18 items across types) ----
            Object[][] issues = {
                {"Setup CI/CD pipeline", "Configure GitHub Actions for automated build, test, and deployment to staging.", "story", "done", "critical", 1, "{cicd,devops}"},
                {"User authentication flow", "Implement email/password login with JWT token refresh and biometric unlock support.", "story", "done", "critical", 2, "{auth,security}"},
                {"Fix crash on note save", "App crashes when saving a note with >10K characters on Android 14 devices.", "bug", "in_review", "critical", 3, "{android,crash}"},
                {"Dark mode support", "Add system-following dark/light theme with CSS variables and manual override toggle.", "story", "in_progress", "high", 4, "{ui,theme}"},
                {"Offline sync engine", "Design and implement local-first sync with conflict resolution using CRDT.", "epic", "in_progress", "high", 5, "{sync,architecture}"},
                {"API rate limiting", "Add token bucket rate limiter to prevent abuse. Return 429 with Retry-After header.", "task", "in_progress", "high", 6, "{backend}"},
                {"i18n for Japanese", "Translate all UI strings to Japanese. Currently ~60% complete. Remaining: settings, admin.", "task", "in_progress", "medium", 7, "{i18n,ja}"},
                {"Performance audit", "Run Lighthouse and identify render-blocking resources. Target FCP < 1.5s.", "task", "todo", "high", 8, "{performance}"},
                {"Keyboard shortcut for AI chat", "Add Cmd+K / Ctrl+K to toggle Global AI Assistant panel from any page.", "story", "todo", "high", 9, "{ai,shortcut}"},
                {"Email notification digest", "Send daily/weekly digest emails summarizing project activity and overdue tasks.", "story", "todo", "medium", 10, "{email,notification}"},
                {"Markdown export for wiki", "Add one-click export of wiki pages to .md files with frontmatter support.", "task", "todo", "medium", 11, "{wiki,export}"},
                {"Sprint burndown chart", "Add SVG burndown chart on Board page showing ideal vs actual velocity.", "story", "done", "high", 12, "{board,chart}"},
                {"MCP tool: create_issue", "Implement MCP tool for creating issues via Claude Code with title, description, priority.", "task", "done", "medium", 13, "{mcp}"},
                {"Database query timeout", "Some complex issue filters timeout after 30s on large projects (>5K issues).", "bug", "todo", "medium", 14, "{backend,performance}"},
                {"Login page SSR flicker", "Brief flash of unstyled content on login page during cold start in production build.", "bug", "todo", "low", 15, "{ui,ssr}"},
                {"README update for v2.0", "Update project README with new architecture diagram, API changes, and migration guide.", "task", "todo", "low", 16, "{docs}"},
                {"User onboarding wizard", "5-step interactive wizard: workspace setup → invite team → create first issue → explore AI → done.", "story", "in_progress", "high", 17, "{onboarding,ui}"},
                {"AI-powered issue triage", "Use LLM to auto-assign priority, labels, and suggested assignee based on issue description.", "story", "todo", "high", 18, "{ai,ml}"},
            };
            for (int i = 0; i < issues.length; i++) {
                String iid = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 32);
                jdbc.update(
                    "INSERT INTO issues (id, tenant_id, project_id, workflow_id, issue_number, title, description, type, status, priority, labels, reporter_id, sort_order, created_at, updated_at) " +
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?::text[],?,?,NOW(),NOW())",
                    iid, demoTenant.getId(), demoProjectId, workflowId, i + 1,
                    (String) issues[i][0], (String) issues[i][1], (String) issues[i][2],
                    (String) issues[i][3], (String) issues[i][4], (String) issues[i][6],
                    demoUser.getId(), (Integer) issues[i][5]
                );
            }

            // ---- Demo Sprint ----
            String sprintId = java.util.UUID.randomUUID().toString().replace("-", "");
            jdbc.update(
                "INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, status, created_at) " +
                "VALUES (?,?,?,?,?::date,?::date,?,NOW())",
                sprintId, demoProjectId, "Sprint 3 — Core Features",
                "Complete dark mode, offline sync MVP, i18n, and resolve critical crash bug",
                "2026-07-14", "2026-07-28", "active"
            );
            // Assign in-progress issues to the sprint
            jdbc.update("UPDATE issues SET sprint_id = ? WHERE project_id = ? AND status IN ('in_progress','in_review')",
                sprintId, demoProjectId);

            // ---- Demo Wiki Pages ----
            String[][] wikis = {
                {"Architecture Overview", "architecture", "published", "# TomiHub Architecture\n\n## System Components\n\n- **Frontend**: React 19 + TanStack Router + Zustand\n- **Backend**: Java Spring Boot 3.3 + MyBatis-Plus\n- **AI Brain**: Python FastAPI + litellm + pgvector\n- **Database**: PostgreSQL 16 with pgvector extension\n- **Message Queue**: RabbitMQ for event-driven embedding pipeline\n\n## Key Design Decisions\n\n1. **Multi-tenant isolation**: Each tenant can optionally use a separate database\n2. **Hybrid search**: pgvector cosine similarity + PostgreSQL tsvector full-text search fused via RRF\n3. **Offline license**: RSA-2048 signed license files with machine fingerprint binding"},
                {"Getting Started Guide", "general", "published", "# Getting Started\n\nWelcome to TomiHub! This guide will help you set up your first project.\n\n## 1. Create a Project\nNavigate to Home and click **+ New Project**. Choose a name and key.\n\n## 2. Invite Team Members\nGo to Members → + Invite. Enter email addresses separated by commas.\n\n## 3. Create Your First Issue\nClick **+ New Issue** on the Issues page. Fill in the title, type, and priority.\n\n## 4. Explore AI Features\n- **AI Assistant** (⌘K): Ask questions about your project\n- **AI Review**: Get code review suggestions on issues\n- **AI Health**: Monitor project health metrics"},
                {"API Integration Guide", "api-documentation", "published", "# API Integration\n\n## Authentication\nAll API requests require a JWT token in the Authorization header:\n```\nAuthorization: Bearer <token>\n```\n\n## MCP Server\nConnect Claude Code or any MCP-compatible client:\n1. Go to API Keys → Generate New Key\n2. Configure your MCP client with the endpoint URL and API key\n3. Available tools: create_issue, update_issue, search_knowledge, create_wiki\n\n## Rate Limiting\n- 100 requests/minute per API key\n- 1000 requests/minute per tenant"},
                {"Sprint Planning Best Practices", "runbook", "published", "# Sprint Planning\n\n## Before the Meeting\n1. Review the previous sprint burndown\n2. Check the backlog for prioritized items\n3. Estimate story points for top backlog items\n\n## During the Meeting\n1. Review completed work (5 min)\n2. Discuss blocked items (5 min)\n3. Plan next sprint items (20 min)\n\n## Capacity Planning\n- Each developer: ~8 SP per 2-week sprint\n- Reserve 20% for bug fixes and unplanned work"},
            };
            for (String[] w : wikis) {
                String wid = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 32);
                jdbc.update(
                    "INSERT INTO knowledge_pages (id, tenant_id, project_id, title, content, category, status, created_by, created_at, updated_at) " +
                    "VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())",
                    wid, demoTenant.getId(), demoProjectId, w[0], w[3], w[1], w[2], demoUser.getId()
                );
            }

            // ---- Demo Comments ----
            String firstIssueId = null;
            try {
                firstIssueId = jdbc.queryForObject(
                    "SELECT id FROM issues WHERE project_id = ? AND issue_number = 1", String.class, demoProjectId);
            } catch (Exception ignored) {}
            if (firstIssueId != null) {
                jdbc.update(
                    "INSERT INTO comments (id, issue_id, author_id, body, created_at, updated_at) VALUES (?,?,?,?,NOW(),NOW())",
                    java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 32),
                    firstIssueId, demoUser.getId(),
                    "CI/CD pipeline is critical for maintaining code quality. Let's use GitHub Actions with matrix builds for iOS and Android."
                );
            }
        }

        // Ensure demo user is a member of demo tenant — writable, so the live
        // demo lets visitors experience everything except admin functions.
        // Upsert: existing installs may still carry the old viewer role.
        Integer memberCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM tenant_members WHERE tenant_id = ? AND user_id = ?",
            Integer.class, demoTenant.getId(), demoUser.getId());
        if (memberCount == null || memberCount == 0) {
            jdbc.update(
                "INSERT INTO tenant_members (id, tenant_id, user_id, role, joined_at) VALUES (?,?,?,?,NOW())",
                uuid.substring(0, 32), demoTenant.getId(), demoUser.getId(), "member"
            );
        } else {
            jdbc.update(
                "UPDATE tenant_members SET role = 'member' WHERE tenant_id = ? AND user_id = ?",
                demoTenant.getId(), demoUser.getId());
        }

        // Grant write access on the DEMO project. Project permissions resolve
        // from project_member_roles + project_members.role_id (→ roles →
        // role_permissions), NOT the denormalized role string — a member row
        // without the join is read-only (403 on CREATE_ISSUES). Must run
        // unconditionally: an existing DEMO project has neither the join nor
        // role_id, so its owner would stay a viewer forever. "Developer" is the
        // system project role with issue-create/comment perms — everything
        // except admin stays experienceable. The demo admin (if seeded) gets the
        // same role so the operator sees the workspace as visitors do.
        grantDemoProjectRole(demoTenant.getId(), demoUser.getId());
        if (adminUser != null) {
            grantDemoProjectRole(demoTenant.getId(), adminUser.getId());
        }

        // Issue full-scope tokens (skip refresh token persistence for guest — ephemeral session)
        TokenPair tokens = tokenService.issueFullScopeTokens(demoUser, demoTenant.getId());

        // Build response
        UserVO userVO = UserVO.from(demoUser);
        TenantVO tenantVO = new TenantVO(demoTenant.getId(), demoTenantName,
            demoTenantSlug, null, "member");
        List<TenantVO> tenants = List.of(tenantVO);
        return new AuthResponse(userVO, tokens, tenants, tenantVO, false, false);
    }

    /**
     * Ensure {@code userId} can work the DEMO project: a project_members row
     * carrying the Developer role id plus the project_member_roles join the
     * PermissionEvaluator actually reads (the denormalized role string alone is
     * ignored by permission resolution). Idempotent — safe to run on every
     * guest-login. No-op when the project or the system Developer role is missing.
     */
    private void grantDemoProjectRole(String tenantId, String userId) {
        String projectId = null;
        try {
            projectId = jdbc.queryForObject(
                "SELECT id FROM projects WHERE tenant_id = ? AND key = 'DEMO' LIMIT 1",
                String.class, tenantId);
        } catch (Exception ignored) { /* project absent — nothing to grant */ }
        if (projectId == null) return;
        String devRoleId = null;
        try {
            devRoleId = jdbc.queryForObject(
                "SELECT id FROM roles WHERE name = 'Developer' AND scope = 'project' LIMIT 1",
                String.class);
        } catch (Exception ignored) { /* roles seed missing */ }
        if (devRoleId == null) return;
        Integer pmCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM project_members WHERE project_id = ? AND user_id = ?",
            Integer.class, projectId, userId);
        if (pmCount == null || pmCount == 0) {
            jdbc.update(
                "INSERT INTO project_members (id, project_id, user_id, role, role_id, joined_at) VALUES (?,?,?,?,?,NOW())",
                java.util.UUID.randomUUID().toString().replace("-", ""),
                projectId, userId, "Developer", devRoleId);
        } else {
            jdbc.update(
                "UPDATE project_members SET role = 'Developer', role_id = ? WHERE project_id = ? AND user_id = ?",
                devRoleId, projectId, userId);
        }
        // Join row the PermissionEvaluator actually reads.
        jdbc.update(
            "INSERT INTO project_member_roles (project_id, user_id, role_id, granted_by) VALUES (?,?,?,?) " +
            "ON CONFLICT (project_id, user_id, role_id) DO NOTHING",
            projectId, userId, devRoleId, userId);
    }

    private String generateSlug(String displayName) {
        String base = displayName.replaceAll("[^a-zA-Z0-9\\u4e00-\\u9fa5]", "-")
            .replaceAll("-+", "-").replaceAll("^-|-$", "");
        if (base.isEmpty()) base = "workspace";
        String slug = base;
        int suffix = 1;
        while (tenantRepo.findBySlug(slug).isPresent()) {
            slug = base + "-" + suffix++;
        }
        return slug;
    }
}
