package com.ai_pm.core.config;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.security.JwtValidator;
import com.ai_pm.core.entity.ApiKey;
import com.ai_pm.core.repository.ApiKeyRepository;
import com.ai_pm.core.repository.HitlConfigRepository;
import com.ai_pm.core.repository.UserDisplayRepository;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

/**
 * Authentication filter — two paths:
 *   1. X-Api-Key header   → SHA-256 verify → TenantContext
 *   2. Authorization: Bearer <JWT> → RS256 validate → TenantContext
 *   3. Neither → 401
 */
@Slf4j
@Component
@Order(1)
public class ApiKeyAuthFilter implements Filter {

    private final ApiKeyRepository apiKeyRepo;
    private final HitlConfigRepository hitlConfigRepo;
    private final UserDisplayRepository userDisplayRepo;
    private final JwtValidator jwtValidator;

    public ApiKeyAuthFilter(ApiKeyRepository apiKeyRepo,
                            HitlConfigRepository hitlConfigRepo,
                            UserDisplayRepository userDisplayRepo,
                            JwtPublicKeyProvider jwtPublicKeyProvider) {
        this.apiKeyRepo = apiKeyRepo;
        this.hitlConfigRepo = hitlConfigRepo;
        this.userDisplayRepo = userDisplayRepo;
        this.jwtValidator = new JwtValidator(jwtPublicKeyProvider.getPublicKey());
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        // Public endpoints — no auth at all
        String path = request.getRequestURI();
        if (path.endsWith("/api/v1/api-keys/verify") || path.endsWith("/actuator/health")
            || path.startsWith("/ws")
            || (path.startsWith("/api/v1/auth/") && !path.contains("/select-tenant"))) {
            chain.doFilter(req, res);
            return;
        }

        // CORS preflight — let Spring CORS handle it without auth
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(req, res);
            return;
        }

        // ── Path 1: API Key ──
        String apiKey = request.getHeader("X-Api-Key");
        if (apiKey != null && !apiKey.isBlank()) {
            String hash = sha256(apiKey.trim());
            var key = apiKeyRepo.findByHash(hash).orElse(null);

            if (key != null && Boolean.TRUE.equals(key.getIsActive())
                    && (key.getExpiresAt() == null || key.getExpiresAt().isAfter(Instant.now()))) {
                // Update last_used_at via direct SQL to avoid MyBatis-Plus scopes jsonb mismatch
                try { apiKeyRepo.updateLastUsed(key.getId(), Instant.now()); } catch (Exception ignored) {}

                // Device binding: bind device fingerprint on first use, reject on mismatch
                String deviceFingerprint = request.getHeader("X-Device-Fingerprint");
                String deviceName = request.getHeader("X-Device-Name");
                if (deviceFingerprint != null && !deviceFingerprint.isBlank()) {
                    if (key.getDeviceFingerprint() == null) {
                        // First use — bind device
                        apiKeyRepo.bindDevice(key.getId(), deviceFingerprint,
                            deviceName != null ? deviceName : "Unknown", Instant.now());
                    } else if (!key.getDeviceFingerprint().equals(deviceFingerprint)) {
                        sendError(response, 403, "Device fingerprint mismatch. This API key is bound to another device. Unbind it first in API Keys settings.");
                        TenantContextHolder.clear();
                        return;
                    }
                }

                String agentName = request.getHeader("agent_name");
                String displayName = userDisplayRepo.findDisplayNameById(key.getUserId());
                TenantContextHolder.set(key.getTenantId(), key.getUserId(), agentName, displayName);

                // Self-management endpoints — skip HITL check
                if (path.contains("/api/v1/api-keys") || path.contains("/api/v1/hitl-config")
                    || path.contains("/api/v1/mcp-audit") || path.contains("/api/v1/notifications")
                    || path.contains("/api/v1/llm-config") || path.contains("/api/v1/reports")) {
                    try { chain.doFilter(req, res); } finally { TenantContextHolder.clear(); }
                    return;
                }

                // HITL check for write operations via API Key
                // Skip if MCP server already confirmed (X-Hitl-Confirmed header)
                if (isWriteOperation(request) && requiresHitlConfirmation(key)
                    && !"true".equals(request.getHeader("X-Hitl-Confirmed"))) {
                    sendError(response, 403,
                        "HITL confirmation required. Use MCP endpoint (/mcp) for write operations, or set this agent to Auto mode in API Keys.");
                    TenantContextHolder.clear();
                    return;
                }

                try { chain.doFilter(req, res); } finally { TenantContextHolder.clear(); }
                return;
            }
            sendError(response, 401, "Invalid or expired API Key");
            return;
        }

        // ── Path 2: JWT ──
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            try {
                var claims = jwtValidator.validate(authHeader.substring(7));
                String tenantId = claims.get("tenant_id", String.class);
                String userId = claims.getSubject();
                if (tenantId != null) {
                    TenantContextHolder.set(tenantId, userId);
                    try { chain.doFilter(req, res); } finally { TenantContextHolder.clear(); }
                    return;
                }
            } catch (Exception e) {
                log.debug("JWT validation failed: {}", e.getMessage());
            }
        }

        sendError(response, 401, "Authentication required — provide X-Api-Key or Bearer token");
    }

    private void sendError(HttpServletResponse res, int code, String msg) throws IOException {
        res.setStatus(code);
        res.setContentType("application/json");
        res.getOutputStream().write(
            ("{\"code\":" + code + ",\"message\":\"" + msg + "\"}").getBytes(StandardCharsets.UTF_8));
    }

    private boolean isWriteOperation(HttpServletRequest request) {
        String method = request.getMethod();
        return "POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)
            || "PATCH".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method);
    }

    private boolean requiresHitlConfirmation(ApiKey key) {
        // Check global override first
        var global = hitlConfigRepo.findByUserAndAgent(key.getTenantId(), key.getUserId(), null).orElse(null);
        if (global != null && Boolean.TRUE.equals(global.getIsGlobalEnabled())) {
            return "manual".equals(global.getMode());
        }
        // Check per-key HITL mode
        if ("auto".equalsIgnoreCase(key.getHitlMode())) return false;
        // Default: manual
        return true;
    }

    private static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return Base64.getEncoder().encodeToString(md.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
