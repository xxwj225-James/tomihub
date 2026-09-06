package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.web.PageResult;
import com.ai_pm.core.entity.Comment;
import com.ai_pm.core.event.EmbeddingEvent;
import com.ai_pm.core.repository.CommentRepository;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CommentService {

    private final CommentRepository commentRepo;
    private final com.ai_pm.core.repository.UserDisplayRepository userDisplayRepo;
    private final ApplicationEventPublisher eventPublisher;
    private final PermissionEvaluator permissionEvaluator;
    private static final ObjectMapper mapper = new ObjectMapper();

    @Transactional(readOnly = true)
    public List<Comment> listByIssue(String issueId) {
        return commentRepo.findByIssueId(issueId);
    }

    @Transactional(readOnly = true)
    public PageResult<Comment> listByIssuePaged(String issueId, int pageNum, int size) {
        Page<Comment> mpPage = new Page<>(pageNum, Math.min(size, 200));
        var result = commentRepo.findByIssueIdPaged(mpPage, issueId);
        return PageResult.of(result);
    }

    @Transactional
    public Comment add(String issueId, String body) {
        String userId = TenantContextHolder.getUserId();
        enforceIssuePermission(issueId, "PROJECT:COMMENT");
        String agentName = TenantContextHolder.getAgentName();
        String displayName = TenantContextHolder.getDisplayName();
        Comment c = new Comment();
        c.setIssueId(issueId);
        c.setBody(body.trim());
        c.setAuthorId(userId);
        c.setCreatedAt(Instant.now());
        // Resolve display name if not in context
        String resolvedName = (displayName != null && !displayName.isBlank())
            ? displayName : userDisplayRepo.findDisplayNameById(userId);
        if (resolvedName == null || resolvedName.isBlank()) resolvedName = userId;

        if (agentName != null && !agentName.isBlank()) {
            c.setAuthorName(resolvedName + "@" + agentName);
        } else {
            c.setAuthorName(resolvedName);
        }
        commentRepo.insert(c);

        // Trigger async embedding generation for comment body
        try {
            Map<String, String> ctx = commentRepo.findIssueContext(issueId);
            if (ctx != null && ctx.get("tenant_id") != null && ctx.get("project_id") != null) {
                eventPublisher.publishEvent(EmbeddingEvent.commentCreated(
                    ctx.get("tenant_id"), ctx.get("project_id"), c.getId(), body.trim()));
            }
        } catch (Exception e) {
            log.warn("Failed to publish embedding event for comment {}: {}", c.getId(), e.getMessage());
        }

        return c;
    }

    @Transactional
    public void delete(String commentId) {
        Comment c = commentRepo.selectById(commentId);
        if (c == null) throw new com.ai_pm.common.exception.BusinessException(40400, "Comment not found");
        Map<String, String> ctx = commentRepo.findIssueContext(c.getIssueId());
        String projectId = ctx != null ? ctx.get("project_id") : null;
        if (projectId != null && !hasProjectPermission(projectId, "PROJECT:DELETE_COMMENTS")) {
            String userId = TenantContextHolder.getUserId();
            boolean own = userId != null && userId.equals(c.getAuthorId())
                && hasProjectPermission(projectId, "PROJECT:DELETE_OWN_COMMENTS");
            if (!own) {
                throw new com.ai_pm.common.exception.PermissionDeniedException(
                    "PROJECT:DELETE_COMMENTS", projectId);
            }
        }
        commentRepo.deleteById(commentId);
    }

    // ─── Permission helpers ───

    /** Resolve the issue's project and enforce a permission code; system flows (no user) pass. */
    private void enforceIssuePermission(String issueId, String code) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return;
        Map<String, String> ctx = commentRepo.findIssueContext(issueId);
        if (ctx == null || ctx.get("project_id") == null) return;
        permissionEvaluator.enforce(userId, TenantContextHolder.getTenantId(), ctx.get("project_id"), code);
    }

    private boolean hasProjectPermission(String projectId, String code) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return true;
        return permissionEvaluator.hasPermission(userId, TenantContextHolder.getTenantId(), projectId, code);
    }

    /**
     * AI optimize — calls ai-brain (Python/LiteLLM) via HTTP.
     * Per design doc §3.1 path B: Java → ai-brain → LiteLLM → LLM.
     * Falls back to rule-based if ai-brain is unavailable.
     */
    public Map<String, Object> optimize(String rawText) {
        String text = rawText != null ? rawText.trim() : "";
        if (text.isEmpty()) {
            return Map.of("original", "", "optimized", "", "improvements", List.of());
        }

        try {
            String json = mapper.writeValueAsString(Map.of("text", text));
            // AI-BOUNDARY: protocol passthrough to ai-brain (closed-source).
            // Falls back to rule-based when ai-brain is unavailable.
            var url = URI.create("http://ai-brain-api:8000/api/v1/ai/optimize-comment").toURL();
            var conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(55000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }
            if (conn.getResponseCode() == 200) {
                String body = new String(conn.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                @SuppressWarnings("unchecked")
                Map<String, Object> result = mapper.readValue(body, Map.class);
                return result;
            }
            log.warn("ai-brain returned {}: {}", conn.getResponseCode(),
                new String(conn.getErrorStream().readAllBytes(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.warn("ai-brain optimize unavailable: {}", e.toString());
        }

        return ruleBasedOptimize(text);
    }

    private Map<String, Object> ruleBasedOptimize(String text) {
        var improvements = new ArrayList<String>();
        String optimized = text;

        if (!text.isEmpty() && Character.isLowerCase(text.charAt(0))) {
            optimized = Character.toUpperCase(text.charAt(0)) + text.substring(1);
            improvements.add("Capitalized first letter.");
        }
        if (!text.endsWith(".") && !text.endsWith("!") && !text.endsWith("?")) {
            optimized += ".";
            improvements.add("Added period.");
        }

        return Map.of("original", text, "optimized", optimized, "improvements", improvements);
    }
}
