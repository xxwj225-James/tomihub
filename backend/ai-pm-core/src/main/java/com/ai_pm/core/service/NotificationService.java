package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.common.web.PageResult;
import com.ai_pm.core.entity.Notification;
import com.ai_pm.core.repository.NotificationRepository;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notifRepo;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate txTemplate;

    // ─── Create (idempotent) ───

    @Transactional
    public Notification createOrReuse(Map<String, Object> body) {
        String tenantId = TenantContextHolder.getTenantId();
        String sourceAgent = str(body, "sourceAgent");
        String clientRequestId = str(body, "clientRequestId");

        // Idempotency check
        if (sourceAgent != null && clientRequestId != null) {
            var existing = notifRepo.findByIdempotent(tenantId, sourceAgent, clientRequestId);
            if (existing.isPresent()) {
                log.info("Idempotent hit: returning existing notification {}", existing.get().getId());
                return existing.get();
            }
        }

        Notification n = new Notification();
        n.setTenantId(tenantId);
        n.setType(str(body, "type"));
        n.setSubtype(str(body, "subtype"));
        n.setTargetUserId(str(body, "targetUserId"));
        n.setTitle(str(body, "title"));
        n.setBody(str(body, "body"));
        n.setSourceUserId(str(body, "sourceUserId"));
        n.setSourceAgent(sourceAgent);
        n.setSourceType(str(body, "sourceType", "agent"));
        n.setProjectId(str(body, "projectId"));
        n.setIssueKey(str(body, "issueKey"));
        n.setIssueTitle(str(body, "issueTitle"));
        n.setLink(str(body, "link"));
        n.setActionType(str(body, "actionType", "none"));
        n.setActionPayload(str(body, "actionPayload", "{}"));
        n.setStatus(str(body, "status", "pending"));
        n.setClientRequestId(clientRequestId);
        n.setVersion(0);

        if (body.get("expiresAt") != null) {
            n.setExpiresAt(Instant.ofEpochSecond(longVal(body, "expiresAt")));
        }

        try {
            notifRepo.insert(n);
        } catch (Exception e) {
            // Idempotent insert conflict — current tx is aborted (PG unique violation),
            // so run the recovery query in a NEW transaction.
            if (sourceAgent != null && clientRequestId != null) {
                var recovered = txTemplate.execute(status ->
                    notifRepo.findByIdempotent(tenantId, sourceAgent, clientRequestId));
                if (recovered != null && recovered.isPresent()) {
                    return recovered.get();
                }
                log.warn("Idempotent recovery failed after insert conflict: {}", clientRequestId);
                return n;  // return the in-memory object as best effort
            }
            throw new RuntimeException("Failed to insert notification", e);
        }
        log.info("Notification created: id={}, type={}, status={}", n.getId(), n.getType(), n.getStatus());
        return n;
    }

    // ─── Query ───

    @Transactional(readOnly = true)
    public List<Notification> list(String type, String status) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        // Return notifications targeted to this user OR public (no targetUserId)
        if (type != null || status != null) {
            return notifRepo.findForUserFiltered(tenantId, userId, type, status);
        }
        return notifRepo.findForUser(tenantId, userId);
    }

    @Transactional(readOnly = true)
    public PageResult<Notification> listPaged(String type, String status, int pageNum, int size) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        Page<Notification> mpPage = new Page<>(pageNum, Math.min(size, 200));
        if (type != null || status != null) {
            return PageResult.of(notifRepo.findForUserFilteredPaged(mpPage, tenantId, userId, type, status));
        }
        return PageResult.of(notifRepo.findForUserPaged(mpPage, tenantId, userId));
    }

    @Transactional(readOnly = true)
    public Notification getById(String id) {
        Notification n = notifRepo.selectById(id);
        if (n == null) throw new BusinessException(40400, "Notification not found");
        return n;
    }

    // ─── Resolve (optimistic lock) ───

    @Transactional
    public Notification resolve(String id, String action, String resolvedBy) {
        Notification n = notifRepo.selectById(id);
        if (n == null) throw new BusinessException(40400, "Notification not found");
        if (!"pending".equals(n.getStatus())) {
            throw new BusinessException(40900, "Notification already " + n.getStatus());
        }

        String newStatus = switch (action) {
            case "approve" -> "approved";
            case "deny" -> "denied";
            case "dismiss" -> "dismissed";
            default -> throw new BusinessException(40000, "Invalid action: " + action);
        };

        n.setStatus(newStatus);
        n.setResolvedBy(resolvedBy);
        n.setResolvedAt(Instant.now());
        notifRepo.updateById(n);  // @Version ensures no lost update
        log.info("Notification {} {}d by {}", id, action, resolvedBy);
        return n;
    }

    // ─── Read ───

    @Transactional
    public void markRead(String id) {
        Notification n = notifRepo.selectById(id);
        if (n != null) {
            n.setReadAt(Instant.now());
            notifRepo.updateById(n);
        }
    }

    // ─── Helpers ───

    private static String str(Map<String, Object> body, String key) {
        return str(body, key, null);
    }

    private static String str(Map<String, Object> body, String key, String defaultVal) {
        Object v = body.get(key);
        return v != null ? v.toString() : defaultVal;
    }

    private static long longVal(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(v.toString()); } catch (Exception e) { return 0; }
    }
}
