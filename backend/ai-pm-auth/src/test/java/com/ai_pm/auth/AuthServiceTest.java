package com.ai_pm.auth;

import com.ai_pm.auth.dto.AuthRequest;
import com.ai_pm.auth.dto.AuthResponse;
import com.ai_pm.auth.entity.Tenant;
import com.ai_pm.common.entity.TenantMember;
import com.ai_pm.auth.entity.User;
import com.ai_pm.auth.repository.*;
import com.ai_pm.common.repository.TenantMemberRepository;
import com.ai_pm.auth.service.AuthService;
import com.ai_pm.auth.service.TokenService;
import com.ai_pm.auth.service.VerificationCodeService;
import com.ai_pm.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock UserRepository userRepo;
    @Mock TenantRepository tenantRepo;
    @Mock TenantMemberRepository memberRepo;
    @Mock InviteRepository inviteRepo;
    @Mock JoinLinkRepository joinLinkRepo;
    @Mock VerificationCodeService codeService;
    @Mock TokenService tokenService;
    @Mock com.ai_pm.auth.service.EmailService emailService;
    @Mock org.springframework.jdbc.core.JdbcTemplate jdbc;

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(
            userRepo, tenantRepo, memberRepo, jdbc, inviteRepo, joinLinkRepo, codeService, tokenService, passwordEncoder, emailService);
    }

    @Test
    void register_shouldCreateUserAndTenant() {
        // Given
        when(userRepo.existsByEmail("alice@test.com")).thenReturn(false);
        doNothing().when(codeService).verifyCode("alice@test.com", "123456", "register");
        when(tenantRepo.findBySlug(anyString())).thenReturn(Optional.empty());
        // anyString() doesn't match null in strict mode — use nullable()
        when(tokenService.issueFullScopeTokens(any(User.class), nullable(String.class)))
            .thenReturn(com.ai_pm.auth.dto.TokenPair.of("at", "rt", 900));

        // When
        AuthResponse resp = authService.register(new AuthRequest.Register(
            "alice@test.com", "123456", "SecureP@ss1", "Alice", null, null, null));

        // Then
        assertThat(resp.user().email()).isEqualTo("alice@test.com");
        assertThat(resp.requireTenantSelection()).isFalse();
        verify(userRepo).insert(any(User.class));
        verify(tenantRepo).insert(any(Tenant.class));
        verify(jdbc).update(org.mockito.ArgumentMatchers.startsWith("INSERT INTO tenant_members"), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void register_shouldRejectDuplicateEmail() {
        when(userRepo.existsByEmail("alice@test.com")).thenReturn(true);

        assertThrows(BusinessException.class, () ->
            authService.register(new AuthRequest.Register(
                "alice@test.com", "123456", "SecureP@ss1", "Alice", null, null, null)));
    }

    @Test
    void register_shouldRejectWeakPassword() {
        when(userRepo.existsByEmail("alice@test.com")).thenReturn(false);

        assertThrows(BusinessException.class, () ->
            authService.register(new AuthRequest.Register(
                "alice@test.com", "123456", "12345", "Alice", null, null, null))); // too short
    }

    @Test
    void login_shouldReturnPreTenantTokenForMultiTenantUser() {
        // Given
        User user = createUser("alice@test.com", passwordEncoder.encode("SecureP@ss1"));
        Tenant t1 = createTenant("t1", "workspace-1");
        Tenant t2 = createTenant("t2", "workspace-2");

        when(userRepo.findByEmail("alice@test.com")).thenReturn(Optional.of(user));
        when(memberRepo.findByUserId(user.getId())).thenReturn(List.of(
            createMember(t1.getId(), user.getId(), "owner"),
            createMember(t2.getId(), user.getId(), "member")));
        when(tenantRepo.findById(t1.getId())).thenReturn(Optional.of(t1));
        when(tenantRepo.findById(t2.getId())).thenReturn(Optional.of(t2));
        when(tokenService.issuePreTenantTokens(eq(user), anyBoolean()))
            .thenReturn(com.ai_pm.auth.dto.TokenPair.of("at", "rt", 300));

        // When
        AuthResponse resp = authService.login(
            new AuthRequest.Login("alice@test.com", "SecureP@ss1", false),
            "127.0.0.1", "TestAgent");

        // Then
        assertThat(resp.requireTenantSelection()).isTrue();  // ★ multi-tenant = pre-tenant
        assertThat(resp.currentTenant()).isNull();           // ★ no tenant bound yet
        assertThat(resp.tenants()).hasSize(2);
    }

    @Test
    void login_shouldReturnFullScopeTokenForSingleTenantUser() {
        User user = createUser("bob@test.com", passwordEncoder.encode("SecureP@ss1"));
        Tenant t1 = createTenant("t1", "workspace-1");

        when(userRepo.findByEmail("bob@test.com")).thenReturn(Optional.of(user));
        when(memberRepo.findByUserId(user.getId())).thenReturn(List.of(
            createMember(t1.getId(), user.getId(), "owner")));
        when(tenantRepo.findById(t1.getId())).thenReturn(Optional.of(t1));
        when(tokenService.issueFullScopeTokens(eq(user), eq(t1.getId())))
            .thenReturn(com.ai_pm.auth.dto.TokenPair.of("at", "rt", 900));

        AuthResponse resp = authService.login(
            new AuthRequest.Login("bob@test.com", "SecureP@ss1", false),
            "127.0.0.1", "TestAgent");

        assertThat(resp.requireTenantSelection()).isFalse();
        assertThat(resp.currentTenant()).isNotNull();
    }

    @Test
    void login_shouldLockAccountAfter5Failures() {
        User user = createUser("alice@test.com", passwordEncoder.encode("SecureP@ss1"));
        user.setFailedLoginAttempts(0);
        when(userRepo.findByEmail("alice@test.com")).thenReturn(Optional.of(user));

        // Fail 5 times
        for (int i = 0; i < 5; i++) {
            try {
                authService.login(
                    new AuthRequest.Login("alice@test.com", "WrongPassword", false),
                    "127.0.0.1", "TestAgent");
            } catch (BusinessException ignored) {}
        }

        // Now should be locked
        assertThat(user.getFailedLoginAttempts()).isGreaterThanOrEqualTo(5);
        assertThat(user.getLockedUntil()).isNotNull();
    }

    @Test
    void login_shouldRejectDisabledAccount() {
        User user = createUser("alice@test.com", passwordEncoder.encode("SecureP@ss1"));
        user.setStatus("disabled");
        when(userRepo.findByEmail("alice@test.com")).thenReturn(Optional.of(user));

        assertThrows(BusinessException.class, () ->
            authService.login(
                new AuthRequest.Login("alice@test.com", "SecureP@ss1", false),
                "127.0.0.1", "TestAgent"));
    }

    // ─── Helpers ───

    private User createUser(String email, String passwordHash) {
        User u = new User();
        u.setId("u-" + email.hashCode());
        u.setEmail(email);
        u.setPasswordHash(passwordHash);
        u.setDisplayName("Test User");
        u.setStatus("active");
        u.setFailedLoginAttempts(0);
        return u;
    }

    private Tenant createTenant(String id, String slug) {
        Tenant t = new Tenant();
        t.setId(id);
        t.setName("Workspace " + slug);
        t.setSlug(slug);
        t.setPlan("free");
        t.setIsActive(true);
        return t;
    }

    private TenantMember createMember(String tenantId, String userId, String role) {
        TenantMember m = new TenantMember();
        m.setId("tm-" + tenantId + "-" + userId);
        m.setTenantId(tenantId);
        m.setUserId(userId);
        m.setRole(role);
        return m;
    }
}
