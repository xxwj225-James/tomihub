package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.entity.Notification;
import com.ai_pm.core.entity.Report;
import com.ai_pm.core.repository.AiDecisionFeedbackRepository;
import com.ai_pm.core.repository.AiTrainingPairRepository;
import com.ai_pm.core.repository.ReportRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepo;
    private final NotificationService notifService;
    private final com.ai_pm.common.mail.SmtpMailSender mailSender;
    private final AiDecisionFeedbackRepository feedbackRepo;
    private final AiTrainingPairRepository trainingPairRepo;
    private final ObjectMapper objectMapper;
    private final PermissionEvaluator permissionEvaluator;

    // ─── Permission helpers ───

    /** Report generation is an AI activity — requires PROJECT:VIEW_AI_ANALYSIS (viewers lack it). */
    private void enforceReportCreate(String projectId) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return;
        if (projectId == null || projectId.isBlank()) return; // tenant-level artifact
        permissionEvaluator.enforce(userId, TenantContextHolder.getTenantId(), projectId, "PROJECT:VIEW_AI_ANALYSIS");
    }

    /** Report updates/deletes: the creator, or a project admin. */
    private boolean canManageReport(Report r) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return true;
        if (userId.equals(r.getGeneratedBy())) return true;
        if (r.getProjectId() != null && !r.getProjectId().isBlank()) {
            return permissionEvaluator.hasPermission(
                userId, TenantContextHolder.getTenantId(), r.getProjectId(), "PROJECT:ADMIN");
        }
        return false;
    }

    private void enforceManageReport(Report r) {
        if (!canManageReport(r)) {
            throw new com.ai_pm.common.exception.PermissionDeniedException(
                "PROJECT:ADMIN", r.getProjectId() != null ? r.getProjectId() : r.getId());
        }
    }

    // ─── Query ───

    @Transactional(readOnly = true)
    public List<Report> list(String status, String tab) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        if ("shared".equals(tab)) {
            return reportRepo.findSharedWithUser(tenantId, userId);
        }
        if (status != null && !status.isBlank()) {
            return reportRepo.findByCreatorAndStatus(tenantId, userId, status);
        }
        return reportRepo.findByCreator(tenantId, userId);
    }

    @Transactional(readOnly = true)
    public Report getById(String id) {
        Report r = reportRepo.selectById(id);
        if (r == null) throw new BusinessException(40400, "Report not found");
        return r;
    }

    // ─── Create & Update ───

    @Transactional
    public Report create(String title, String reportType, String projectId,
                         String content, String originalContent, String context) {
        enforceReportCreate(projectId);
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        Report r = new Report();
        r.setTenantId(tenantId);
        r.setGeneratedBy(userId);
        r.setProjectId(projectId);
        r.setReportType(reportType);
        r.setTitle(title != null ? title : "Untitled Report");
        r.setContent(content != null ? content : "");
        r.setOriginalContent(originalContent);
        r.setContext(context);
        r.setStatus("draft");
        r.setGeneratedAt(Instant.now());

        reportRepo.insertReport(r);
        log.info("Report created: id={}, type={}, user={}", r.getId(), reportType, userId);
        return r;
    }

    @Transactional
    public Report update(String id, String title, String content) {
        Report r = reportRepo.selectById(id);
        if (r == null) throw new BusinessException(40400, "Report not found");
        enforceManageReport(r);
        String oldContent = r.getContent();
        String originalContent = r.getOriginalContent();
        if (title != null) r.setTitle(title);
        if (content != null) r.setContent(content);
        reportRepo.updateContent(r);
        log.info("Report updated: {}", id);

        // ─── Implicit feedback: report content correction ───
        if (content != null && originalContent != null && !originalContent.isBlank()
            && !content.equals(originalContent)) {
            try {
                double ratio = editRatio(originalContent, content);
                if (ratio >= 0.15 && ratio <= 0.70) {
                    String tenantId = TenantContextHolder.getTenantId();
                    String ctx = objectMapper.writeValueAsString(Map.of(
                        "title", r.getTitle(), "report_type", r.getReportType(),
                        "edit_ratio", Math.round(ratio * 100) + "%"));
                    feedbackRepo.capture(tenantId, r.getProjectId(), id,
                        "REPORT_CORRECT", originalContent.substring(0, Math.min(originalContent.length(), 500)),
                        "CORRECT", content.substring(0, Math.min(content.length(), 500)), ctx);
                    // Also accumulate as training pair
                    trainingPairRepo.insertPair(tenantId, id, "REPORT_GEN",
                        originalContent.substring(0, Math.min(originalContent.length(), 3000)),
                        content, originalContent, ratio >= 0.3 ? 0.5 : 0.7);
                }
            } catch (Exception e) { log.warn("Failed to capture report correction feedback: {}", e.getMessage()); }
        }
        return r;
    }

    @Transactional
    public void delete(String id) {
        Report r = reportRepo.selectById(id);
        if (r == null) throw new BusinessException(40400, "Report not found");
        enforceManageReport(r);
        reportRepo.deleteById(id);
        log.info("Report deleted: {}", id);
    }

    // ─── Send ───

    @Transactional
    public Report send(String id, SendRequest req) {
        Report r = reportRepo.selectById(id);
        if (r == null) throw new BusinessException(40400, "Report not found");
        enforceManageReport(r);

        String userId = TenantContextHolder.getUserId();
        String userName = TenantContextHolder.getDisplayName();
        if (userName == null || userName.isBlank()) userName = userId;

        // Build sent_to record — merge with existing recipients on re-send
        var sentTo = new java.util.ArrayList<Map<String, Object>>();
        try {
            if (r.getSentTo() != null && !r.getSentTo().isBlank() && !"[]".equals(r.getSentTo())) {
                var existing = objectMapper.readValue(r.getSentTo(), java.util.List.class);
                for (var item : existing) sentTo.add((Map<String, Object>) item);
            }
        } catch (Exception ignored) {}

        // In-app sharing: create notifications for each user
        if (req.inApp() != null && req.inApp().userIds() != null) {
            for (String targetUserId : req.inApp().userIds()) {
                if (targetUserId == null || targetUserId.isBlank()) continue;
                if (targetUserId.equals(userId)) continue; // don't notify yourself
                String clientRequestId = "report-send-" + id + "-" + targetUserId + "-" + System.currentTimeMillis();
                Map<String, Object> notifBody = new java.util.HashMap<>();
                notifBody.put("type", "report_shared");
                String summary = r.getContent() != null
                    ? r.getContent().replaceAll("[#*`]", "").replaceAll("\\s+", " ").trim().substring(0, Math.min(r.getContent().length(), 200))
                    : r.getTitle();
                notifBody.put("title", r.getTitle());
                notifBody.put("body", summary);
                notifBody.put("target_user_id", targetUserId);
                notifBody.put("sourceUserId", userId);
                notifBody.put("sourceAgent", "user");
                notifBody.put("link", "/reports/" + id);
                notifBody.put("actionType", "link");
                notifBody.put("actionPayload", "{\"url\": \"/reports/" + id + "\"}");
                notifBody.put("clientRequestId", clientRequestId);
                notifService.createOrReuse(notifBody);

                sentTo.add(Map.of("userId", targetUserId, "method", "in_app"));
            }
        }

        // Email sharing — send full report content via SMTP
        if (req.email() != null && req.email().to() != null) {
            String subject = req.email().subject() != null ? req.email().subject() : r.getTitle();
            // Convert markdown to basic HTML for email readability
            // Order: deeper headings first to avoid partial matches
            String contentHtml = r.getContent() != null
                ? r.getContent()
                    .replaceAll("(?i)<br\\s*/?>", "\n")     // normalize existing <br> tags to newlines first
                    .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    .replaceAll("(?m)^#### (.+)$", "<h4 style='font-size:14px;color:#1a1a2e;margin:12px 0 2px'>$1</h4>")
                    .replaceAll("(?m)^### (.+)$", "<h3 style='font-size:15px;color:#1a1a2e;margin:16px 0 4px'>$1</h3>")
                    .replaceAll("(?m)^## (.+)$", "<h2 style='font-size:17px;color:#1a1a2e;margin:20px 0 6px'>$1</h2>")
                    .replaceAll("(?m)^# (.+)$", "<h1 style='font-size:20px;color:#1a1a2e;margin:24px 0 8px'>$1</h1>")
                    .replaceAll("\\*\\*(.+?)\\*\\*", "<strong>$1</strong>")
                    .replaceAll("(?m)^- (.+)$", "<li style='margin:2px 0'>$1</li>")
                    .replaceAll("(?m)^\\d+\\. (.+)$", "<li style='margin:2px 0'>$1</li>")
                    .replace("\n\n", "<br><br>")
                : "<p>No content</p>";
            String htmlBody = "<div style='max-width:640px;font-family:-apple-system,sans-serif;font-size:14px;color:#333;line-height:1.6'>"
                + "<div style='border-bottom:2px solid #4f46e5;padding:12px 0;margin-bottom:20px'>"
                + "<span style='font-size:18px;font-weight:700;color:#4f46e5'>TomiHub</span>"
                + "<span style='font-size:12px;color:#999;margin-left:12px'>Project Report</span>"
                + "</div>"
                + "<p style='color:#666;font-size:13px;margin-bottom:20px'>"
                + "This <b>" + r.getReportType() + "</b> report was shared with you via TomiHub.</p>"
                + "<div style='background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px'>"
                + contentHtml
                + "</div>"
                + "<div style='border-top:1px solid #e5e7eb;margin-top:20px;padding-top:12px'>"
                + "<p style='font-size:11px;color:#999'>Sent via TomiHub Project Management System</p>"
                + "</div></div>";
            String cc = req.email().cc() != null && !req.email().cc().isEmpty()
                ? String.join(",", req.email().cc()) : null;
            for (String address : req.email().to()) {
                try {
                    mailSender.send(address, cc, subject, htmlBody);
                    sentTo.add(Map.of("address", address, "method", "email"));
                } catch (Exception e) {
                    log.error("Failed to send report email to {}: {}", address, e.getMessage());
                    sentTo.add(Map.of("address", address, "method", "email", "status", "failed", "error", e.getMessage()));
                }
            }
        }

        try {
            r.setSentTo(objectMapper.writeValueAsString(sentTo));
        } catch (JsonProcessingException e) {
            r.setSentTo("[]");
        }
        r.setStatus("sent");
        r.setSentAt(Instant.now());
        reportRepo.updateSendStatus(r);
        log.info("Report sent: id={}, recipients={}", id, sentTo.size());
        return r;
    }

    // ─── Dismiss (hide shared report from recipient's view) ───

    @Transactional
    public void dismiss(String id) {
        // Per-recipient preference (mark-as-read), not a content write — any holder may dismiss.
        Report r = reportRepo.selectById(id);
        if (r == null) throw new BusinessException(40400, "Report not found");
        String userId = TenantContextHolder.getUserId();
        try {
            var dismissed = new java.util.ArrayList<String>();
            if (r.getDismissedBy() != null && !r.getDismissedBy().isBlank()) {
                dismissed.addAll(objectMapper.readValue(r.getDismissedBy(), java.util.List.class));
            }
            if (!dismissed.contains(userId)) {
                dismissed.add(userId);
                r.setDismissedBy(objectMapper.writeValueAsString(dismissed));
            }
        } catch (Exception e) {
            r.setDismissedBy("[\"" + userId + "\"]");
        }
        reportRepo.updateDismissedBy(r);
        log.info("Report dismissed by recipient: id={}, userId={}", id, userId);
    }

    // ─── Feedback helpers ───

    /** Compute edit ratio between two texts after stripping Markdown/HTML markup.
     *  Returns 0.0 (identical) to 1.0 (completely different). */
    private double editRatio(String original, String edited) {
        String a = stripMarkup(original);
        String b = stripMarkup(edited);
        int maxLen = Math.max(a.length(), b.length());
        if (maxLen == 0) return 0.0;
        int dist = levenshtein(a, b);
        return (double) dist / maxLen;
    }

    /** Strip Markdown syntax, HTML tags, and normalize whitespace for fair text comparison. */
    private String stripMarkup(String text) {
        return text
            .replaceAll("(?s)<!--.*?-->", "")     // HTML comments
            .replaceAll("<[^>]+>", "")            // HTML tags
            .replaceAll("(?m)^#{1,6}\\s*", "")    // Markdown headings
            .replaceAll("\\*\\*(.+?)\\*\\*", "$1") // bold
            .replaceAll("\\*(.+?)\\*", "$1")       // italic
            .replaceAll("`{1,3}[^`]*`{1,3}", "")  // inline/code blocks
            .replaceAll("\\[([^\\]]+)\\]\\([^)]+\\)", "$1") // links
            .replaceAll("(?m)^[-*+]\\s+", "")      // list markers
            .replaceAll("(?m)^\\d+\\.\\s+", "")    // numbered lists
            .replaceAll("\\|", " ")                // table pipes
            .replaceAll("^[-=]+$", "")             // setext headings
            .replaceAll(">\\s?", "")               // blockquotes
            .replaceAll("\\s+", " ")               // normalize whitespace
            .trim();
    }

    private int levenshtein(String a, String b) {
        int[][] dp = new int[a.length() + 1][b.length() + 1];
        for (int i = 0; i <= a.length(); i++) dp[i][0] = i;
        for (int j = 0; j <= b.length(); j++) dp[0][j] = j;
        for (int i = 1; i <= a.length(); i++)
            for (int j = 1; j <= b.length(); j++)
                dp[i][j] = Math.min(dp[i-1][j-1] + (a.charAt(i-1) == b.charAt(j-1) ? 0 : 1),
                         Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1));
        return dp[a.length()][b.length()];
    }

    // ─── DTOs ───

    public record SendRequest(InAppShare inApp, EmailShare email) {
        public record InAppShare(java.util.List<String> userIds) {}
        public record EmailShare(java.util.List<String> to, java.util.List<String> cc, String subject) {}
    }
}
