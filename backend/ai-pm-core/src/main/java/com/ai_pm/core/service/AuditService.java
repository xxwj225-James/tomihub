package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Security audit logging — INSERT only, no UPDATE/DELETE.
 * Records all sensitive operations: export, delete, permission changes, MCP calls.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    @Transactional
    public void record(String action, String resourceType, String resourceId, Map<String, Object> details) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        try {
            String detailsJson = details != null ? mapper.writeValueAsString(details) : null;
            jdbc.update(
                "INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, created_at) " +
                "VALUES (?,?,?,?,?,?,?::jsonb,?)",
                UUID.randomUUID().toString().replace("-", ""),
                tenantId, userId, action, resourceType, resourceId, detailsJson, Instant.now()
            );
        } catch (Exception e) {
            log.warn("Audit log failed: {}", e.getMessage());
        }
    }

    /** Convenience: record without details */
    public void record(String action, String resourceType, String resourceId) {
        record(action, resourceType, resourceId, null);
    }
}
