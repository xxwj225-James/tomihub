package com.ai_pm.auth.service;

import com.ai_pm.auth.config.JwtProperties;
import com.ai_pm.auth.dto.TokenPair;
import com.ai_pm.auth.entity.RefreshToken;
import com.ai_pm.auth.entity.User;
import com.ai_pm.auth.repository.RefreshTokenRepository;
import com.ai_pm.common.exception.BusinessException;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.digest.DigestUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class TokenService {

    private final JwtTokenProvider jwtProvider;
    private final JwtProperties jwtProps;
    private final RefreshTokenRepository refreshTokenRepo;

    public static final String SCOPE_TENANT_SELECTION = "tenant_selection";
    public static final String SCOPE_BUSINESS = "business";

    // ═══ Token Issuance ═══

    /**
     * Issue Pre-Tenant Token (after login, before workspace selection).
     * scope = "tenant_selection", tenant_id = null.
     * Only allows /auth/select-tenant, /auth/refresh, /auth/logout.
     */
    public TokenPair issuePreTenantTokens(User user, boolean rememberMe) {
        String accessToken = jwtProvider.generateAccessToken(
            user.getId(), user.getEmail(),
            null,                    // ★ no tenant
            SCOPE_TENANT_SELECTION,   // ★ restricted scope
            Duration.ofMinutes(5)     // short-lived
        );

        Duration refreshTtl = rememberMe
            ? jwtProps.getRememberMeRefreshTtl()
            : jwtProps.getRefreshTokenTtl();

        String refreshToken = jwtProvider.generateRefreshToken(
            user.getId(), null, refreshTtl);

        return TokenPair.of(accessToken, refreshToken, 300);
    }

    /**
     * Issue Full-Scope Token (after workspace selection).
     * scope = "business", tenant_id = specific tenant.
     * Allows all business APIs.
     */
    public TokenPair issueFullScopeTokens(User user, String tenantId) {
        String accessToken = jwtProvider.generateAccessToken(
            user.getId(), user.getEmail(),
            tenantId,                // ★ bound to tenant
            SCOPE_BUSINESS,          // ★ full scope
            jwtProps.getAccessTokenTtl()
        );

        String refreshToken = jwtProvider.generateRefreshToken(
            user.getId(), tenantId, jwtProps.getRefreshTokenTtl());

        return TokenPair.of(accessToken, refreshToken,
            jwtProps.getAccessTokenTtl().getSeconds());
    }

    // ═══ Token Refresh (rotation) ═══

    @Transactional
    public TokenPair refreshTokens(String rawRefreshToken) {
        if (!jwtProvider.validateToken(rawRefreshToken)) {
            throw new BusinessException(40102, "Refresh token invalid or expired");
        }

        Claims claims = jwtProvider.parseClaims(rawRefreshToken);
        String userId = claims.getSubject();
        String tokenHash = hashToken(rawRefreshToken);

        // Find stored token
        RefreshToken stored = refreshTokenRepo.findByTokenHash(tokenHash)
            .orElseThrow(() -> new BusinessException(40103, "Refresh token revoked"));

        if (Boolean.TRUE.equals(stored.getRevoked())) {
            // ★ Token reuse detected → revoke ALL tokens for this user
            refreshTokenRepo.revokeAllForUser(userId);
            log.warn("SECURITY: Refresh token reuse detected for user={}, revoked all", userId);
            throw new BusinessException(40103, "Token reuse detected. All devices logged out");
        }

        if (stored.getExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException(40102, "Refresh token expired");
        }

        // Revoke old token (rotation) — update ONLY revoked, not the whole
        // entity: device_info is jsonb in the DB and a full updateById would
        // write the String field back into the jsonb column and fail.
        refreshTokenRepo.revokeById(stored.getId());

        // Issue new token pair
        String tenantId = jwtProvider.getTenantId(rawRefreshToken);
        String scope = claims.get("scope", String.class);

        String newAccessToken;
        if (SCOPE_TENANT_SELECTION.equals(scope)) {
            // Still in pre-tenant state → re-issue pre-tenant token
            newAccessToken = jwtProvider.generateAccessToken(
                userId, jwtProvider.getEmail(rawRefreshToken),
                null, SCOPE_TENANT_SELECTION, Duration.ofMinutes(5));
        } else {
            newAccessToken = jwtProvider.generateAccessToken(
                userId, jwtProvider.getEmail(rawRefreshToken),
                tenantId, SCOPE_BUSINESS, jwtProps.getAccessTokenTtl());
        }

        String newRefreshToken = jwtProvider.generateRefreshToken(
            userId, tenantId, jwtProps.getRefreshTokenTtl());

        // Store new refresh token
        storeRefreshToken(userId, newRefreshToken,
            stored.getDeviceName(), stored.getIpAddress());

        return TokenPair.of(newAccessToken, newRefreshToken,
            jwtProps.getAccessTokenTtl().getSeconds());
    }

    // ═══ Storage ═══

    @Transactional
    public void storeRefreshToken(String userId, String rawToken,
                                   String deviceName, String ipAddress) {
        RefreshToken rt = new RefreshToken();
        rt.setUserId(userId);
        rt.setTokenHash(hashToken(rawToken));
        rt.setDeviceName(deviceName);
        rt.setIpAddress(ipAddress);
        rt.setExpiresAt(Instant.now().plus(jwtProps.getRefreshTokenTtl()));
        rt.setRevoked(false);
        refreshTokenRepo.insert(rt);
    }

    @Transactional
    public void revokeUserTokens(String userId) {
        refreshTokenRepo.revokeAllForUser(userId);
    }

    @Transactional
    public void revokeToken(String rawToken) {
        refreshTokenRepo.findByTokenHash(hashToken(rawToken))
            .ifPresent(rt -> refreshTokenRepo.revokeById(rt.getId()));
    }

    private String hashToken(String token) {
        return DigestUtils.sha256Hex(token);
    }
}
