package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.entity.ApiKey;
import com.ai_pm.core.repository.ApiKeyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ApiKeyService {

    private final ApiKeyRepository apiKeyRepo;
    private static final String PREFIX = "ai_pm_";
    private static final int TOKEN_LENGTH = 48;
    private static final SecureRandom RANDOM = new SecureRandom();

    @Transactional(readOnly = true)
    public List<ApiKey> listByUser() {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        List<ApiKey> keys = apiKeyRepo.findByUser(tenantId, userId);
        // Exclude system-internal keys — not user-facing
        keys.removeIf(k -> "ai-brain-internal".equals(k.getName()));
        return keys;
    }

    @Transactional
    public Map<String, Object> generate(String name, String scopes, String hitlMode) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        byte[] bytes = new byte[TOKEN_LENGTH];
        RANDOM.nextBytes(bytes);
        String rawToken = PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String hash = sha256(rawToken);

        ApiKey key = new ApiKey();
        key.setTenantId(tenantId);
        key.setUserId(userId);
        key.setName(name);
        key.setKeyPrefix(PREFIX);
        key.setKeyHash(hash);
        key.setScopes(scopes != null ? scopes : "read,write");
        key.setHitlMode(hitlMode != null ? hitlMode : "manual");
        key.setIsActive(true);
        key.setExpiresAt(Instant.now().plusSeconds(90L * 86400));
        apiKeyRepo.insert(key);

        log.info("API Key generated: id={}, name={}, userId={}", key.getId(), name, userId);

        return Map.of(
            "id", key.getId(),
            "name", key.getName(),
            "key", rawToken,          // shown only once
            "scopes", key.getScopes(),
            "createdAt", key.getCreatedAt() != null ? key.getCreatedAt().toString() : ""
        );
    }

    @Transactional
    public Map<String, Object> verify(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            throw new BusinessException(40101, "API Key is required");
        }
        String hash = sha256(rawKey.trim());
        ApiKey key = apiKeyRepo.findByHash(hash).orElse(null);
        if (key == null) {
            throw new BusinessException(40101, "Invalid API Key");
        }
        if (key.getExpiresAt() != null && key.getExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException(40102, "API Key expired");
        }

        // Update last used time
        key.setLastUsedAt(Instant.now());
        apiKeyRepo.updateById(key);

        return Map.of(
            "valid", true,
            "userId", key.getUserId(),
            "tenantId", key.getTenantId(),
            "scopes", key.getScopes(),
            "hitlMode", key.getHitlMode() != null ? key.getHitlMode() : "manual",
            "name", key.getName()
        );
    }

    @Transactional
    public void revoke(String keyId) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        ApiKey key = apiKeyRepo.selectById(keyId);
        if (key == null || !key.getTenantId().equals(tenantId) || !key.getUserId().equals(userId)) {
            throw new BusinessException(40400, "API Key not found");
        }
        key.setIsActive(false);
        apiKeyRepo.updateById(key);
        log.info("API Key revoked: id={}", keyId);
    }

    private static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
