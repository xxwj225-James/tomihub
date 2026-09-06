package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.entity.TenantMember;
import com.ai_pm.common.exception.IssueNotFoundException;
import com.ai_pm.common.exception.PermissionDeniedException;
import com.ai_pm.common.repository.TenantMemberRepository;
import com.ai_pm.core.entity.IssueSecurityLevel;
import com.ai_pm.core.entity.Role;
import com.ai_pm.core.repository.IssueSecurityRepository;
import com.ai_pm.core.repository.RoleRepository;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.*;
import java.util.function.Supplier;

/**
 * Three-tier permission evaluator.
 *
 * Cache: Caffeine (L1, 5min TTL) + Redis (L2, 10min TTL)
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class PermissionEvaluator {

    private final RoleRepository roleRepository;
    private final IssueSecurityRepository securityRepository;
    private final TenantMemberRepository tenantMemberRepository;
    private final StringRedisTemplate redis;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER =
        new com.fasterxml.jackson.databind.ObjectMapper();

    // L1 cache: 10k entries, 5 min TTL
    private final Cache<String, Set<String>> localCache = Caffeine.newBuilder()
        .maximumSize(10_000)
        .expireAfterWrite(Duration.ofMinutes(5))
        .build();

    // ═══ Public API ═══

    /**
     * Check if user has a specific permission in a project context.
     */
    public boolean hasPermission(String userId, String tenantId,
                                  String projectId, String permissionCode) {
        // Owner bypasses all checks
        if (isTenantOwner(userId, tenantId)) return true;

        Set<String> permissions = getEffectivePermissions(userId, tenantId, projectId);
        return permissions.contains(permissionCode);
    }

    /**
     * Enforce permission — throws if not granted.
     */
    public void enforce(String userId, String tenantId, String projectId,
                         String permissionCode) {
        if (!hasPermission(userId, tenantId, projectId, permissionCode)) {
            throw new PermissionDeniedException(permissionCode, projectId);
        }
    }

    /**
     * Enforce Issue Security Level (3rd tier).
     * Returns silently if OK, throws IssueNotFoundException if denied.
     */
    public void enforceIssueSecurity(String userId, String tenantId, String issueId) {
        if (isTenantOwner(userId, tenantId)) return;

        UUID securityLevelId = securityRepository.findSecurityLevelByIssueId(issueId);
        if (securityLevelId == null) return;  // Public issue

        boolean canSee = canSeeSecurityLevel(userId, securityLevelId);
        if (!canSee) {
            throw new IssueNotFoundException(issueId);  // 404, not 403
        }
    }

    /**
     * Filter a list of issue IDs, returning only those the user can see.
     * Used in list/search queries.
     */
    public Set<String> filterVisibleIssues(String userId, String tenantId,
                                            Set<String> issueIds) {
        if (isTenantOwner(userId, tenantId)) return issueIds;
        return securityRepository.filterVisibleIssueIds(issueIds, userId);
    }

    // ═══ Internal ═══

    private Set<String> getEffectivePermissions(String userId, String tenantId,
                                                 String projectId) {
        String key = "perm:" + userId + ":" + tenantId + ":" + projectId;
        return getCached(key, () -> {
            Set<String> perms = new HashSet<>();

            // Global roles
            for (Role role : roleRepository.findUserGlobalRoles(userId, tenantId)) {
                perms.addAll(role.getPermissionCodes());
            }

            // Project roles — per-project overrides (settings.rolePermissions) win
            Map<String, List<String>> overrides = getRolePermissionOverrides(projectId);
            for (Role role : resolveProjectRoles(userId, projectId)) {
                List<String> codes = overrides.get(role.getName());
                perms.addAll(codes != null ? codes : role.getPermissionCodes());
            }

            return Collections.unmodifiableSet(perms);
        });
    }

    /**
     * Resolve a member's project roles: join table first, then fall back to the
     * free-form role stored on project_members (role_id → role, or role name).
     */
    private List<Role> resolveProjectRoles(String userId, String projectId) {
        List<Role> roles = roleRepository.findUserProjectRoles(userId, projectId);
        if (roles != null && !roles.isEmpty()) return roles;

        try {
            Map<String, Object> row = jdbc.queryForMap(
                "SELECT role_id, role FROM project_members WHERE project_id = ? AND user_id = ?",
                projectId, userId);
            if (row != null) {
                Object roleId = row.get("role_id");
                if (roleId != null && !roleId.toString().isBlank()) {
                    Role byId = roleRepository.selectById(roleId.toString());
                    if (byId != null) return List.of(byId);
                }
                Object roleName = row.get("role");
                if (roleName != null && !roleName.toString().isBlank()) {
                    Role byName = roleRepository.findProjectRoleByName(roleName.toString());
                    if (byName != null) return List.of(byName);
                }
            }
        } catch (Exception e) {
            log.warn("Project role fallback failed for user={} project={}: {}",
                userId, projectId, e.getMessage());
        }
        return List.of();
    }

    /**
     * Per-project role permission overrides from projects.settings.rolePermissions.
     * Empty map when the project defines no overrides.
     */
    public Map<String, List<String>> getRolePermissionOverrides(String projectId) {
        if (projectId == null) return Map.of();
        try {
            String settings = jdbc.queryForObject(
                "SELECT settings FROM projects WHERE id = ?", String.class, projectId);
            if (settings != null && !settings.isBlank()) {
                var node = MAPPER.readTree(settings);
                var rp = node.get("rolePermissions");
                if (rp != null && rp.isObject()) {
                    Map<String, List<String>> overrides = new HashMap<>();
                    rp.fields().forEachRemaining(e -> {
                        List<String> codes = new ArrayList<>();
                        e.getValue().forEach(v -> codes.add(v.asText()));
                        overrides.put(e.getKey(), codes);
                    });
                    return overrides;
                }
            }
        } catch (Exception ignored) { }
        return Map.of();
    }

    /** Evict cached permission sets for one user in one project. */
    public void evictUserCache(String userId, String tenantId, String projectId) {
        String key = "perm:" + userId + ":" + tenantId + ":" + projectId;
        localCache.invalidate(key);
        try { redis.delete("cache:" + key); } catch (Exception ignored) { }
    }

    /** Evict cached permission sets for every user of a project (override changes affect all). */
    public void evictProjectCache(String tenantId, String projectId) {
        try {
            Set<String> keys = redis.keys("cache:perm:*:*:" + projectId);
            if (keys != null && !keys.isEmpty()) redis.delete(keys);
        } catch (Exception e) {
            log.warn("Failed to evict permission cache for project {}: {}", projectId, e.getMessage());
        }
        // Caffeine entries can't be pattern-evicted; they expire within 5 minutes.
    }

    private boolean canSeeSecurityLevel(String userId, UUID securityLevelId) {
        String key = "sec:" + userId + ":" + securityLevelId;
        return getCached(key, () ->
            securityRepository.isUserInSecurityLevel(securityLevelId, userId)
                ? Set.of("true")
                : Set.of()
        ).contains("true");
    }

    private boolean isTenantOwner(String userId, String tenantId) {
        return tenantMemberRepository
            .findByTenantIdAndUserId(tenantId, userId)
            .map(m -> "owner".equals(m.getRole()))
            .orElse(false);
    }

    @SuppressWarnings("unchecked")
    private <T> T getCached(String key, Supplier<T> loader) {
        Object cached = localCache.getIfPresent(key);
        if (cached != null) return (T) cached;

        String redisVal = redis.opsForValue().get("cache:" + key);
        if (redisVal != null) {
            T result = (T) fromCacheValue(redisVal);
            localCache.put(key, (Set<String>) result);
            return result;
        }

        T result = loader.get();
        redis.opsForValue().set("cache:" + key,
            result instanceof Set<?> s ? String.join(",", (Set<String>) s) : result.toString(),
            Duration.ofMinutes(10));
        localCache.put(key, (Set<String>) result);
        return result;
    }

    private Set<String> fromCacheValue(String value) {
        if (value == null || value.isEmpty()) return Set.of();
        return Set.of(value.split(","));
    }
}
