package com.ai_pm.auth;

import com.ai_pm.auth.config.JwtProperties;
import com.ai_pm.auth.dto.TokenPair;
import com.ai_pm.auth.entity.RefreshToken;
import com.ai_pm.auth.entity.User;
import com.ai_pm.auth.repository.RefreshTokenRepository;
import com.ai_pm.auth.service.JwtTokenProvider;
import com.ai_pm.auth.service.TokenService;
import com.ai_pm.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TokenServiceTest {

    private static JwtTokenProvider jwtProvider;
    private static JwtProperties jwtProps;

    private TokenService tokenService;
    private RefreshTokenRepository refreshTokenRepo;

    @BeforeAll
    static void initKeys() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair pair = gen.generateKeyPair();

        jwtProps = new JwtProperties();
        jwtProps.setPrivateKey("-----BEGIN PRIVATE KEY-----\n" +
            Base64.getMimeEncoder().encodeToString(pair.getPrivate().getEncoded()) +
            "\n-----END PRIVATE KEY-----");
        jwtProps.setPublicKey("-----BEGIN PUBLIC KEY-----\n" +
            Base64.getMimeEncoder().encodeToString(pair.getPublic().getEncoded()) +
            "\n-----END PUBLIC KEY-----");
        jwtProps.setAccessTokenTtl(Duration.ofMinutes(15));
        jwtProps.setRefreshTokenTtl(Duration.ofDays(1));
        jwtProps.setIssuer("ai-pm-test");

        jwtProvider = new JwtTokenProvider(jwtProps, mock(JdbcTemplate.class));
        jwtProvider.init();
    }

    @BeforeEach
    void setUp() {
        refreshTokenRepo = mock(RefreshTokenRepository.class);
        tokenService = new TokenService(jwtProvider, jwtProps, refreshTokenRepo);
    }

    @Test
    void issuePreTenantToken_shouldHaveTenantSelectionScope() {
        User user = createUser();
        TokenPair tokens = tokenService.issuePreTenantTokens(user, false);

        assertThat(jwtProvider.validateToken(tokens.accessToken())).isTrue();
        assertThat(jwtProvider.getScope(tokens.accessToken()))
            .isEqualTo(TokenService.SCOPE_TENANT_SELECTION);
        assertThat(jwtProvider.getTenantId(tokens.accessToken())).isNull();
        assertThat(tokens.expiresIn()).isEqualTo(300); // 5 min
    }

    @Test
    void issueFullScopeToken_shouldHaveBusinessScope() {
        User user = createUser();
        TokenPair tokens = tokenService.issueFullScopeTokens(user, "tenant-1");

        assertThat(jwtProvider.getScope(tokens.accessToken()))
            .isEqualTo(TokenService.SCOPE_BUSINESS);
        assertThat(jwtProvider.getTenantId(tokens.accessToken())).isEqualTo("tenant-1");
    }

    @Test
    void refreshTokens_shouldRotateTokens() {
        User user = createUser();
        TokenPair oldTokens = tokenService.issueFullScopeTokens(user, "tenant-1");

        RefreshToken stored = new RefreshToken();
        stored.setUserId(user.getId());
        stored.setTokenHash(org.apache.commons.codec.digest.DigestUtils.sha256Hex(oldTokens.refreshToken()));
        stored.setRevoked(false);
        stored.setExpiresAt(java.time.Instant.now().plus(Duration.ofDays(1)));

        when(refreshTokenRepo.findByTokenHash(anyString())).thenReturn(Optional.of(stored));

        TokenPair newTokens = tokenService.refreshTokens(oldTokens.refreshToken());

        assertThat(jwtProvider.validateToken(newTokens.accessToken())).isTrue();
        assertThat(jwtProvider.getTenantId(newTokens.accessToken())).isEqualTo("tenant-1");
        assertThat(newTokens.accessToken()).isNotEqualTo(oldTokens.accessToken()); // rotated
    }

    @Test
    void refreshTokens_shouldDetectReuseAndRevokeAll() {
        User user = createUser();
        TokenPair oldTokens = tokenService.issueFullScopeTokens(user, "tenant-1");

        RefreshToken stored = new RefreshToken();
        stored.setUserId(user.getId());
        stored.setTokenHash(org.apache.commons.codec.digest.DigestUtils.sha256Hex(oldTokens.refreshToken()));
        stored.setRevoked(true); // ★ already revoked = reuse detected!
        stored.setExpiresAt(java.time.Instant.now().plus(Duration.ofDays(1)));

        when(refreshTokenRepo.findByTokenHash(anyString())).thenReturn(Optional.of(stored));

        assertThrows(BusinessException.class,
            () -> tokenService.refreshTokens(oldTokens.refreshToken())
        );

        // Should revoke ALL user tokens
        verify(refreshTokenRepo).revokeAllForUser(user.getId());
    }

    @Test
    void refreshTokens_shouldRejectExpiredToken() {
        // Generate an expired token
        String expiredToken = jwtProvider.generateRefreshToken(
            "user-1", "t1", Duration.ofMillis(1));
        try { Thread.sleep(10); } catch (InterruptedException ignored) {}

        assertThrows(BusinessException.class,
            () -> tokenService.refreshTokens(expiredToken));
    }

    private User createUser() {
        User u = new User();
        u.setId("u-test-1");
        u.setEmail("test@example.com");
        return u;
    }
}
