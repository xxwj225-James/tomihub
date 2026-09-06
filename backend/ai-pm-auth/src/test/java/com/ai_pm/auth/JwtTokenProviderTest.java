package com.ai_pm.auth;

import com.ai_pm.auth.config.JwtProperties;
import com.ai_pm.auth.service.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Duration;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

class JwtTokenProviderTest {

    private static JwtTokenProvider jwtProvider;
    private static JwtProperties props;

    @BeforeAll
    static void setUp() throws Exception {
        // Generate test RSA key pair
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair pair = gen.generateKeyPair();

        String privateKeyPem = "-----BEGIN PRIVATE KEY-----\n" +
            Base64.getMimeEncoder().encodeToString(pair.getPrivate().getEncoded()) +
            "\n-----END PRIVATE KEY-----";
        String publicKeyPem = "-----BEGIN PUBLIC KEY-----\n" +
            Base64.getMimeEncoder().encodeToString(pair.getPublic().getEncoded()) +
            "\n-----END PUBLIC KEY-----";

        props = new JwtProperties();
        props.setPrivateKey(privateKeyPem);
        props.setPublicKey(publicKeyPem);
        props.setAccessTokenTtl(Duration.ofMinutes(15));
        props.setRefreshTokenTtl(Duration.ofDays(1));
        props.setIssuer("ai-pm-test");

        jwtProvider = new JwtTokenProvider(props, mock(JdbcTemplate.class));
        jwtProvider.init();
    }

    @Test
    void shouldGenerateAndValidateAccessToken() {
        String token = jwtProvider.generateAccessToken(
            "user-1", "alice@test.com", "tenant-1",
            "business", Duration.ofMinutes(15));

        assertThat(jwtProvider.validateToken(token)).isTrue();

        Claims claims = jwtProvider.parseClaims(token);
        assertThat(claims.getSubject()).isEqualTo("user-1");
        assertThat(claims.get("email", String.class)).isEqualTo("alice@test.com");
        assertThat(claims.get("tenant_id", String.class)).isEqualTo("tenant-1");
        assertThat(claims.get("scope", String.class)).isEqualTo("business");
    }

    @Test
    void shouldGeneratePreTenantTokenWithNullTenantId() {
        String token = jwtProvider.generateAccessToken(
            "user-1", "alice@test.com", null,
            "tenant_selection", Duration.ofMinutes(5));

        Claims claims = jwtProvider.parseClaims(token);
        assertThat(claims.get("tenant_id", String.class)).isNull();
        assertThat(claims.get("scope", String.class)).isEqualTo("tenant_selection");
    }

    @Test
    void shouldRejectExpiredToken() {
        String token = jwtProvider.generateAccessToken(
            "user-1", "alice@test.com", "t1",
            "business", Duration.ofMillis(1));

        // Wait for token to expire
        try { Thread.sleep(10); } catch (InterruptedException ignored) {}

        assertThat(jwtProvider.validateToken(token)).isFalse();
    }

    @Test
    void shouldRejectTamperedToken() {
        String token = jwtProvider.generateAccessToken(
            "user-1", "alice@test.com", "t1",
            "business", Duration.ofMinutes(15));

        String tampered = token.substring(0, token.length() - 5) + "xxxxx";
        assertThat(jwtProvider.validateToken(tampered)).isFalse();
    }

    @Test
    void shouldGenerateAndValidateRefreshToken() {
        String token = jwtProvider.generateRefreshToken(
            "user-1", "tenant-1", Duration.ofDays(7));

        assertThat(jwtProvider.validateToken(token)).isTrue();
        assertThat(jwtProvider.getUserId(token)).isEqualTo("user-1");
        assertThat(jwtProvider.getTenantId(token)).isEqualTo("tenant-1");
    }

    @Test
    void shouldExtractJti() {
        String token = jwtProvider.generateAccessToken(
            "user-1", "alice@test.com", "t1",
            "business", Duration.ofMinutes(15));

        assertThat(jwtProvider.getJti(token)).isNotNull();
        assertThat(jwtProvider.getJti(token)).hasSize(36); // UUID format
    }

    @Test
    void shouldRejectNullToken() {
        // validateToken catches exceptions internally and returns false
        assertThat(jwtProvider.validateToken(null)).isFalse();
    }
}
