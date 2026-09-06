package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.common.web.PageResult;
import com.ai_pm.core.entity.Issue;
import com.ai_pm.core.entity.IssueChangelog;
import com.ai_pm.core.event.EmbeddingEvent;
import com.ai_pm.core.repository.AiDecisionFeedbackRepository;
import com.ai_pm.core.repository.AiTrainingPairRepository;
import com.ai_pm.core.repository.IssueChangelogRepository;
import com.ai_pm.core.repository.IssueRepository;
import com.ai_pm.core.repository.UserDisplayRepository;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class IssueService {

    private final IssueRepository issueRepo;
    private final UserDisplayRepository userDisplayRepo;
    private final IssueChangelogRepository changelogRepo;
    private final NotificationService notifService;
    private final ProjectService projectService;
    private final AiDecisionFeedbackRepository feedbackRepo;
    private final AiTrainingPairRepository trainingPairRepo;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final PermissionEvaluator permissionEvaluator;

    // Fields that only creator or project manager can edit
    private static final Set<String> PROTECTED_FIELDS = Set.of(
        "title", "description", "priority", "securityLevel"
    );

    // Fibonacci sequence for Scrum story point validation
    private static final Set<Double> FIBONACCI = Set.of(1.0, 2.0, 3.0, 5.0, 8.0, 13.0, 21.0);

    private void validateStoryPoints(String projectId, Double sp) {
        if (sp == null) return; // null = not yet estimated, always allowed
        try {
            var proj = projectService.getById(projectId);
            var settings = proj.getSettings();
            if (settings != null && settings.contains("\"scrum\"") && !FIBONACCI.contains(sp)) {
                throw new BusinessException(40000,
                    "Story points must be a Fibonacci number: 1, 2, 3, 5, 8, 13, or 21");
            }
        } catch (BusinessException e) { throw e; }
        catch (Exception ignored) { /* project lookup failed, skip validation */ }
    }

    public record CreateIssueRequest(
        String projectId, String title, String description, String type,
        String priority, String assigneeId, Double storyPoints,
        String sprintId, String parentId, String labels, String securityLevel,
        Double workload, Double remainingPoints, String phase
    ) {}

    // ─── Permission helpers ───

    private boolean canEditProtectedFields(Issue issue) {
        String userId = TenantContextHolder.getUserId();
        // Creator can always edit their own issues
        if (userId != null && userId.equals(issue.getReporterId())) return true;
        // In dev mode, dev-user acts as project manager
        if ("dev-user".equals(userId)) return true;
        return false;
    }

    /** Enforce PROJECT:<code> for a user action; internal/system flows (no user) pass through. */
    private void enforceProject(String projectId, String code) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return;
        permissionEvaluator.enforce(userId, TenantContextHolder.getTenantId(), projectId, code);
    }

    private boolean hasProject(String projectId, String code) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return true;
        return permissionEvaluator.hasPermission(userId, TenantContextHolder.getTenantId(), projectId, code);
    }

    /** Edit access: PROJECT:EDIT_ISSUES, or PROJECT:EDIT_OWN_ISSUES on the reporter's own issue. */
    private void enforceEdit(Issue issue) {
        if (hasProject(issue.getProjectId(), "PROJECT:EDIT_ISSUES")) return;
        String userId = TenantContextHolder.getUserId();
        if (userId != null && userId.equals(issue.getReporterId())
            && hasProject(issue.getProjectId(), "PROJECT:EDIT_OWN_ISSUES")) return;
        throw new com.ai_pm.common.exception.PermissionDeniedException(
            "PROJECT:EDIT_ISSUES", issue.getProjectId());
    }

    /** Delete access: PROJECT:DELETE_ISSUES, or PROJECT:DELETE_OWN_ISSUES on the reporter's own issue. */
    private void enforceDelete(Issue issue) {
        if (hasProject(issue.getProjectId(), "PROJECT:DELETE_ISSUES")) return;
        String userId = TenantContextHolder.getUserId();
        if (userId != null && userId.equals(issue.getReporterId())
            && hasProject(issue.getProjectId(), "PROJECT:DELETE_OWN_ISSUES")) return;
        throw new com.ai_pm.common.exception.PermissionDeniedException(
            "PROJECT:DELETE_ISSUES", issue.getProjectId());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getPermissions(String issueId) {
        Issue issue = issueRepo.selectById(issueId);
        if (issue == null) throw new BusinessException(40400, "Issue not found");

        boolean canEditProtected = canEditProtectedFields(issue);
        boolean isCreator = TenantContextHolder.getUserId() != null
            && TenantContextHolder.getUserId().equals(issue.getReporterId());
        boolean canDelete = canEditProtected; // same rules

        return Map.of(
            "canEditProtected", canEditProtected,
            "canDelete", canDelete,
            "isCreator", isCreator,
            "userId", TenantContextHolder.getUserId() != null ? TenantContextHolder.getUserId() : ""
        );
    }

    // ─── CRUD ───

    @Transactional
    public Issue create(CreateIssueRequest req) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        if (req.title() == null || req.title().isBlank()) {
            throw new BusinessException(40000, "Title is required");
        }
        if (req.projectId() == null || req.projectId().isBlank()) {
            throw new BusinessException(40000, "Project ID is required");
        }
        projectService.verifyProjectActive(req.projectId());
        enforceProject(req.projectId(), "PROJECT:CREATE_ISSUES");

        int maxNum = issueRepo.maxIssueNumber(req.projectId());

        Issue issue = new Issue();
        issue.setTenantId(tenantId);
        issue.setProjectId(req.projectId());
        issue.setIssueNumber(maxNum + 1);
        issue.setTitle(req.title().trim());
        issue.setDescription(req.description());
        issue.setType(req.type() != null ? req.type() : "task");
        // Default status by methodology
        String defaultStatus = "todo";
        try {
            var proj = projectService.getById(req.projectId());
            var settings = proj.getSettings();
            if (settings != null && settings.contains("\"scrum\"")) defaultStatus = "product_backlog";
            else if (settings != null && settings.contains("\"kanban\"")) defaultStatus = "backlog";
        } catch (Exception ignored) {}
        issue.setStatus(defaultStatus);
        issue.setPriority(req.priority() != null ? req.priority() : "medium");
        issue.setAssigneeId(req.assigneeId());
        issue.setReporterId(userId);
        issue.setSprintId(req.sprintId());
        issue.setParentId(req.parentId());
        // Validate story points (Fibonacci for Scrum projects)
        validateStoryPoints(req.projectId(), req.storyPoints());
        issue.setStoryPoints(req.storyPoints());
        // remainingPoints: use explicit value if given, otherwise mirror storyPoints
        issue.setRemainingPoints(req.remainingPoints() != null ? req.remainingPoints() : req.storyPoints());
        issue.setWorkload(req.workload());
        issue.setLabels(req.labels());
        issue.setSecurityLevel(req.securityLevel() != null && !req.securityLevel().isBlank() ? req.securityLevel() : null);
        issue.setPhase(req.phase() != null && !req.phase().isBlank() ? req.phase() : null);

        issueRepo.insert(issue);
        log.info("Issue created: id={}, project={}, title={}", issue.getId(), req.projectId(), req.title());

        // Write changelog entries for initial state
        writeChangelog(tenantId, issue.getId(), userId, "status", null, "todo");
        if (req.assigneeId() != null && !req.assigneeId().isBlank()) {
            writeChangelog(tenantId, issue.getId(), userId, "assignee_id", null, req.assigneeId());
        }

        // Trigger async embedding generation
        eventPublisher.publishEvent(EmbeddingEvent.issueCreated(
            tenantId, req.projectId(), issue.getId(), issue.getTitle(),
            issue.getDescription(), userId, null));

        return issue;
    }

    @Transactional(readOnly = true)
    public List<Issue> listMyTasks() {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        List<Issue> issues = issueRepo.findMyTasks(tenantId, userId);
        for (Issue issue : issues) {
            if (issue.getAssigneeId() != null && !issue.getAssigneeId().isBlank()) {
                String name = userDisplayRepo.findDisplayNameById(issue.getAssigneeId());
                issue.setAssigneeName(name != null ? name : issue.getAssigneeId());
            }
        }
        return issues;
    }

    @Transactional(readOnly = true)
    public PageResult<Issue> listMyTasksPaged(int pageNum, int size) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        Page<Issue> mpPage = new Page<>(pageNum, Math.min(size, 200));
        var result = issueRepo.findMyTasksPaged(mpPage, tenantId, userId);
        for (Issue issue : result.getRecords()) {
            if (issue.getAssigneeId() != null && !issue.getAssigneeId().isBlank()) {
                String name = userDisplayRepo.findDisplayNameById(issue.getAssigneeId());
                issue.setAssigneeName(name != null ? name : issue.getAssigneeId());
            }
        }
        return PageResult.of(result);
    }

    @Transactional(readOnly = true)
    public PageResult<Issue> listCreatedByMePaged(int pageNum, int size) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        Page<Issue> mpPage = new Page<>(pageNum, Math.min(size, 200));
        var result = issueRepo.findCreatedByMePaged(mpPage, tenantId, userId);
        return PageResult.of(result);
    }

    @Transactional(readOnly = true)
    public List<Issue> listByProject(String projectId) {
        String tenantId = TenantContextHolder.getTenantId();
        List<Issue> issues = issueRepo.findByProject(tenantId, projectId);
        for (Issue issue : issues) {
            if (issue.getAssigneeId() != null && !issue.getAssigneeId().isBlank()) {
                String name = userDisplayRepo.findDisplayNameById(issue.getAssigneeId());
                issue.setAssigneeName(name != null ? name : issue.getAssigneeId());
            }
        }
        return issues;
    }

    @Transactional(readOnly = true)
    public Issue getById(String issueId) {
        Issue issue = issueRepo.selectById(issueId);
        if (issue == null) throw new BusinessException(40400, "Issue not found");
        return issue;
    }

    @Transactional
    public Issue update(String issueId, UpdateIssueRequest req) {
        Issue issue = issueRepo.selectById(issueId);
        if (issue == null) throw new BusinessException(40400, "Issue not found");
        projectService.verifyProjectActive(issue.getProjectId());
        enforceEdit(issue);

        boolean canEditProtected = canEditProtectedFields(issue);

        // Protected fields — only creator/PM can edit
        if (req.title() != null) {
            if (!canEditProtected) throw new BusinessException(40301, "Only the issue creator or project manager can edit the title");
            issue.setTitle(req.title().trim());
        }
        if (req.description() != null) {
            if (!canEditProtected) throw new BusinessException(40301, "Only the issue creator or project manager can edit the description");
            issue.setDescription(req.description());
        }
        if (req.priority() != null) {
            if (!canEditProtected) throw new BusinessException(40301, "Only the issue creator or project manager can edit the priority");
            issue.setPriority(req.priority());
        }

        // Status change — only PM/creator or assignee can update
        String oldAssigneeId = issue.getAssigneeId();
        String oldStatus = issue.getStatus();

        if (req.status() != null && !req.status().equals(oldStatus)) {
            boolean isAssignee = TenantContextHolder.getUserId() != null
                && TenantContextHolder.getUserId().equals(issue.getAssigneeId());
            if (!canEditProtected && !isAssignee) {
                throw new BusinessException(40303, "Only the assignee or project manager can change the status");
            }
            // product_backlog means not in any sprint — sprintId must be empty
            String effectiveSprint = req.sprintId() != null ? req.sprintId() : issue.getSprintId();
            if ("product_backlog".equals(req.status()) && effectiveSprint != null && !effectiveSprint.isBlank()) {
                throw new BusinessException(40000, "Cannot set status to product_backlog when assigned to a sprint. Remove sprint first.");
            }
            issue.setStatus(req.status());
        } else if (req.status() != null) {
            issue.setStatus(req.status()); // same status, no-op
        }
        if (req.type() != null) issue.setType(req.type());
        if (req.assigneeId() != null) issue.setAssigneeId(req.assigneeId());
        if (req.sprintId() != null) {
            issue.setSprintId(req.sprintId());
            // Auto-promote: product_backlog → sprint_backlog when assigned to sprint
            if ("product_backlog".equals(issue.getStatus()) && !req.sprintId().isBlank()) {
                issue.setStatus("sprint_backlog");
                log.info("Issue {} auto-promoted to sprint_backlog (assigned to sprint {})", issueId, req.sprintId());
            }
        }
        if (req.storyPoints() != null) {
            validateStoryPoints(issue.getProjectId(), req.storyPoints());
            // Auto-sync remainingPoints when storyPoints changes (unless explicitly overridden)
            if (issue.getRemainingPoints() == null
                || issue.getRemainingPoints().equals(issue.getStoryPoints())) {
                issue.setRemainingPoints(req.storyPoints());
            }
            issue.setStoryPoints(req.storyPoints());
        }
        if (req.remainingPoints() != null) issue.setRemainingPoints(req.remainingPoints());
        // When status changes to done/cancelled, auto-set remainingPoints to 0
        if (req.status() != null && !req.status().equals(oldStatus)
            && ("done".equals(req.status()) || "cancelled".equals(req.status()))) {
            issue.setRemainingPoints(0.0);
        }
        if (req.workload() != null) issue.setWorkload(req.workload());
        if (req.labels() != null) issue.setLabels(req.labels());
        if (req.phase() != null) issue.setPhase(req.phase().isBlank() ? null : req.phase());

        // ─── Reopen detection MUST run BEFORE updateIssue, or the incremented
        // reopen_count never reaches the DB (updateIssue persists all fields) ───
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        if (userId == null) userId = "system";
        boolean reopened = req.status() != null && !Objects.equals(oldStatus, req.status())
            && isClosedStatus(oldStatus) && !isClosedStatus(req.status());
        if (reopened) {
            // Feeds the reopen_rate risk signal (docs/55 §2.2 signal 7)
            issue.setReopenCount((issue.getReopenCount() == null ? 0 : issue.getReopenCount()) + 1);
        }

        issueRepo.updateIssue(issue);
        log.info("Issue updated: id={}", issueId);

        // Write changelog for tracked fields
        if (reopened) {
            writeChangelog(tenantId, issueId, userId, "status", oldStatus, req.status());

            // ─── Implicit feedback: reopen capture ───
            try {
                String ctx = objectMapper.writeValueAsString(Map.of(
                    "issue_key", issue.getProjectId() != null ?
                        (projectService.getById(issue.getProjectId()).getKey() + "-" + issue.getIssueNumber()) : "#" + issue.getIssueNumber(),
                    "previous_status", oldStatus, "new_status", req.status()));
                feedbackRepo.capture(tenantId, issue.getProjectId(), issueId,
                    "ISSUE_REOPEN", "AI review marked as " + oldStatus, "REJECT",
                    "Human reopened → " + req.status(), ctx);
            } catch (Exception e) { log.warn("Failed to capture reopen feedback: {}", e.getMessage()); }
        }

        if (req.assigneeId() != null && !Objects.equals(oldAssigneeId, req.assigneeId())) {
            writeChangelog(tenantId, issueId, userId, "assignee_id", oldAssigneeId, req.assigneeId());
            // Send notification to new assignee
            try {
                var project = projectService.getById(issue.getProjectId());
                var projectKey = project.getKey() != null ? project.getKey() : "?";
                var issueKey = projectKey + "-" + issue.getIssueNumber();
                java.util.Map<String, Object> notifParams = new java.util.HashMap<>();
                notifParams.put("type", "issue_assigned");
                notifParams.put("title", project.getName() + ": " + issueKey + " assigned to you");
                notifParams.put("body", "You have been assigned " + issueKey + ": " + issue.getTitle());
                notifParams.put("projectId", issue.getProjectId());
                notifParams.put("targetUserId", req.assigneeId());
                notifParams.put("sourceUserId", userId);
                notifParams.put("sourceAgent", "system");
                notifParams.put("issueKey", issueKey);
                notifParams.put("issueTitle", issue.getTitle());
                notifParams.put("link", "/issues/" + issue.getId());
                notifParams.put("actionType", "link");
                notifParams.put("actionPayload", "{\"url\": \"/issues/" + issue.getId() + "\"}");
                notifParams.put("clientRequestId", "issue-assign-" + issueId + "-" + req.assigneeId());
                notifService.createOrReuse(notifParams);
            } catch (Exception e) {
                log.warn("Failed to send assign notification for issue {}: {}", issueId, e.getMessage());
            }
        }
        if (req.status() != null && !Objects.equals(oldStatus, req.status()) && !reopened) {
            writeChangelog(tenantId, issueId, userId, "status", oldStatus, req.status());
        }

        // ─── Implicit feedback: assignee correction ───
        if (req.assigneeId() != null && !Objects.equals(oldAssigneeId, req.assigneeId()) && oldAssigneeId != null) {
            try {
                String ctx = objectMapper.writeValueAsString(Map.of(
                    "issue_key", issue.getProjectId() != null ?
                        (projectService.getById(issue.getProjectId()).getKey() + "-" + issue.getIssueNumber()) : "#" + issue.getIssueNumber(),
                    "old_assignee", oldAssigneeId, "new_assignee", req.assigneeId()));
                feedbackRepo.capture(tenantId, issue.getProjectId(), issueId,
                    "ISSUE_ASSIGN", "AI/auto assigned to " + oldAssigneeId, "REJECT",
                    "Human changed to " + req.assigneeId(), ctx);
            } catch (Exception e) { log.warn("Failed to capture assign feedback: {}", e.getMessage()); }
        }

        // Trigger async embedding generation when title or description changes
        if (req.title() != null || req.description() != null) {
            eventPublisher.publishEvent(EmbeddingEvent.issueUpdated(
                tenantId, issue.getProjectId(), issueId, issue.getTitle(),
                issue.getDescription(), userId, null));
        }

        return issue;
    }

    private void writeChangelog(String tenantId, String issueId, String changedBy,
                                 String field, String oldValue, String newValue) {
        IssueChangelog cl = new IssueChangelog();
        cl.setTenantId(tenantId);
        cl.setIssueId(issueId);
        cl.setChangedBy(changedBy);
        cl.setField(field);
        cl.setOldValue(oldValue);
        cl.setNewValue(newValue);
        cl.setCreatedAt(Instant.now());
        changelogRepo.insert(cl);
    }

    private boolean isClosedStatus(String status) {
        return status != null && (status.equals("done") || status.equals("cancelled"));
    }

    @Transactional
    public void delete(String issueId) {
        Issue issue = issueRepo.selectById(issueId);
        if (issue == null) throw new BusinessException(40400, "Issue not found");
        projectService.verifyProjectActive(issue.getProjectId());
        enforceDelete(issue);

        if (!canEditProtectedFields(issue)) {
            throw new BusinessException(40302, "Only the issue creator or project manager can delete this issue", HttpStatus.FORBIDDEN);
        }

        issueRepo.deleteById(issueId);
        log.info("Issue deleted: id={}", issueId);
    }

    // ─── Children ───

    @Transactional(readOnly = true)
    public PageResult<Issue> listByProjectPaged(String projectId, int pageNum, int size) {
        String tenantId = TenantContextHolder.getTenantId();
        Page<Issue> mpPage = new Page<>(pageNum, Math.min(size, 200));
        var result = issueRepo.findByProjectPaged(mpPage, tenantId, projectId);
        for (Issue issue : result.getRecords()) {
            if (issue.getAssigneeId() != null && !issue.getAssigneeId().isBlank()) {
                String name = userDisplayRepo.findDisplayNameById(issue.getAssigneeId());
                issue.setAssigneeName(name != null ? name : issue.getAssigneeId());
            }
        }
        return PageResult.of(result);
    }

    @Transactional(readOnly = true)
    public List<Issue> getChildren(String parentId) {
        String tenantId = TenantContextHolder.getTenantId();
        Issue parent = issueRepo.selectById(parentId);
        if (parent == null) throw new BusinessException(40400, "Issue not found");
        List<Issue> children = issueRepo.findChildren(tenantId, parentId);
        for (Issue child : children) {
            if (child.getAssigneeId() != null && !child.getAssigneeId().isBlank()) {
                String name = userDisplayRepo.findDisplayNameById(child.getAssigneeId());
                child.setAssigneeName(name != null ? name : child.getAssigneeId());
            }
        }
        return children;
    }

    // ─── Ranking (fractional sort_order) ───

    @Transactional
    public void updateRank(String issueId, String beforeId, String afterId) {
        Issue issue = issueRepo.selectById(issueId);
        if (issue == null) throw new BusinessException(40400, "Issue not found");
        // Board/backlog ordering — managers or issue operators (devs resolving work)
        if (!hasProject(issue.getProjectId(), "PROJECT:MANAGE_BOARD")
            && !hasProject(issue.getProjectId(), "PROJECT:RESOLVE_ISSUES")) {
            throw new com.ai_pm.common.exception.PermissionDeniedException(
                "PROJECT:MANAGE_BOARD", issue.getProjectId());
        }

        double newRank;
        if (beforeId == null && afterId == null) {
            throw new BusinessException(40000, "Either beforeId or afterId is required");
        }

        if (beforeId != null && afterId != null) {
            // Insert between two issues
            Issue before = issueRepo.selectById(beforeId);
            Issue after = issueRepo.selectById(afterId);
            if (before == null || after == null)
                throw new BusinessException(40400, "Reference issue not found");
            double bRank = before.getSortOrder() != null ? before.getSortOrder() : 0.0;
            double aRank = after.getSortOrder() != null ? after.getSortOrder() : 0.0;
            newRank = (bRank + aRank) / 2.0;
        } else if (beforeId != null) {
            // Place before the reference issue
            Issue before = issueRepo.selectById(beforeId);
            if (before == null) throw new BusinessException(40400, "Reference issue not found");
            double bRank = before.getSortOrder() != null ? before.getSortOrder() : 0.0;
            Double prevRank = issueRepo.findPreviousRank(issue.getProjectId(), bRank);
            if (prevRank == null) {
                newRank = bRank - 1.0;
            } else {
                newRank = (prevRank + bRank) / 2.0;
            }
        } else {
            // Place after the reference issue
            Issue after = issueRepo.selectById(afterId);
            if (after == null) throw new BusinessException(40400, "Reference issue not found");
            double aRank = after.getSortOrder() != null ? after.getSortOrder() : 0.0;
            Double nextRank = issueRepo.findNextRank(issue.getProjectId(), aRank);
            if (nextRank == null) {
                newRank = aRank + 1.0;
            } else {
                newRank = (aRank + nextRank) / 2.0;
            }
        }

        issue.setSortOrder(newRank);
        issueRepo.updateIssue(issue);
        log.info("Issue rank updated: id={}, sortOrder={}", issueId, newRank);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> findSimilarByTitle(String projectId, String title) {
        String tenantId = TenantContextHolder.getTenantId();
        List<Issue> allInProject = issueRepo.findByProject(tenantId, projectId);
        String[] words = title.toLowerCase().split("\\s+");
        var results = new ArrayList<Map<String, Object>>();
        for (Issue other : allInProject) {
            int matches = 0;
            for (String w : words) {
                if (w.length() > 3 && other.getTitle().toLowerCase().contains(w)) matches++;
            }
            if (matches >= 2) {
                results.add(Map.of("id", other.getId(), "title", other.getTitle(),
                    "status", other.getStatus(), "matchScore", Math.min(matches * 25, 100)));
            }
        }
        return results;
    }

    @Transactional(readOnly = true)
    public Map<String, String> generateDescription(String prompt, String context) {
        String body = "{\"prompt\":" + toJson(prompt) + ",\"context\":" + toJson(context != null ? context : "") + "}";
        try {
            // AI-BOUNDARY: protocol passthrough to ai-brain (closed-source).
            // No prompts live in Java — this is a pure HTTP call. For an OSS
            // build, point this URL at a stub or gate it at the gateway.
            var url = java.net.URI.create("http://ai-brain-api:8000/api/v1/ai/generate-description").toURL();
            var conn = (java.net.HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(50000);
            try (var os = conn.getOutputStream()) {
                os.write(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            if (conn.getResponseCode() == 200) {
                var resp = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readTree(conn.getInputStream());
                if (resp.has("description")) {
                    return Map.of("description", resp.get("description").asText());
                }
            }
        } catch (Exception e) {
            log.warn("AI generate description failed: {}", e.getMessage());
        }
        return Map.of("description", "");
    }

    private static String toJson(String s) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(s);
        } catch (Exception e) { return "\"\""; }
    }

    public record UpdateIssueRequest(
        String title, String description, String status, String priority,
        String type, String assigneeId, String sprintId,
        Double storyPoints, Double workload, String labels,
        Double remainingPoints, String phase
    ) {}

    // ═══════════════════════════════════════════
    // AI Features for Issue Detail Page
    // ═══════════════════════════════════════════

    /**
     * Find potentially similar/duplicate issues by keyword matching.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> findSimilarIssues(String issueId) {
        Issue issue = issueRepo.selectById(issueId);
        if (issue == null) throw new BusinessException(40400, "Issue not found");

        String tenantId = TenantContextHolder.getTenantId();
        List<Issue> allInProject = issueRepo.findByProject(tenantId, issue.getProjectId());

        var results = new ArrayList<Map<String, Object>>();
        String[] titleWords = issue.getTitle().toLowerCase().split("\\s+");

        for (Issue other : allInProject) {
            if (other.getId().equals(issueId)) continue;
            String otherTitle = other.getTitle().toLowerCase();
            int matchCount = 0;
            for (String word : titleWords) {
                if (word.length() > 3 && otherTitle.contains(word)) matchCount++;
            }
            if (matchCount >= 2) {
                results.add(Map.of(
                    "id", other.getId(),
                    "title", other.getTitle(),
                    "status", other.getStatus(),
                    "matchScore", Math.min(matchCount * 25, 100)
                ));
            }
        }
        return results;
    }

    /**
     * AI risk analysis — assesses issue complexity and identifies potential risks.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> analyzeRisk(String issueId) {
        Issue issue = issueRepo.selectById(issueId);
        if (issue == null) throw new BusinessException(40400, "Issue not found");

        var risks = new ArrayList<Map<String, String>>();
        int riskScore = 0;

        // No assignee = risk
        if (issue.getAssigneeId() == null || issue.getAssigneeId().isBlank()) {
            risks.add(Map.of("level", "warning", "msg", "Unassigned — issue may be overlooked during sprint planning."));
            riskScore += 25;
        }
        // High priority without SP
        if (("critical".equals(issue.getPriority()) || "high".equals(issue.getPriority())) && (issue.getStoryPoints() == null || issue.getStoryPoints() <= 0)) {
            risks.add(Map.of("level", "danger", "msg", "High-priority issue has no story point estimate — effort is unknown."));
            riskScore += 20;
        }
        // Large SP
        if (issue.getStoryPoints() != null && issue.getStoryPoints() > 8) {
            risks.add(Map.of("level", "warning", "msg", "Large story (" + issue.getStoryPoints() + " SP) — consider breaking into smaller tasks."));
            riskScore += 15;
        }
        // No description
        if (issue.getDescription() == null || issue.getDescription().isBlank()) {
            risks.add(Map.of("level", "warning", "msg", "No description — team members may lack context to resolve effectively."));
            riskScore += 20;
        }
        // Stale issue
        if (issue.getCreatedAt() != null) {
            long daysOld = (System.currentTimeMillis() / 1000 - issue.getCreatedAt().getEpochSecond()) / 86400;
            if (daysOld > 30 && !"done".equals(issue.getStatus())) {
                risks.add(Map.of("level", "danger", "msg", "Issue is " + daysOld + " days old and still open — may be stale or blocked."));
                riskScore += 20;
            }
        }
        // Dependency risk
        if (issue.getParentId() != null && !issue.getParentId().isBlank()) {
            risks.add(Map.of("level", "info", "msg", "This is a sub-task — progress depends on parent issue resolution."));
            riskScore += 5;
        }

        String riskLevel = riskScore >= 50 ? "High Risk" : riskScore >= 25 ? "Medium Risk" : "Low Risk";

        return Map.of(
            "riskScore", riskScore,
            "riskLevel", riskLevel,
            "risks", risks
        );
    }

    /**
     * AI solving suggestions — provides guidance for the assignee.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getSolvingSuggestions(String issueId) {
        Issue issue = issueRepo.selectById(issueId);
        if (issue == null) throw new BusinessException(40400, "Issue not found");

        var suggestions = new ArrayList<Map<String, String>>();

        String type = issue.getType() != null ? issue.getType().toLowerCase() : "task";
        String desc = issue.getDescription() != null ? issue.getDescription().toLowerCase() : "";

        if ("bug".equals(type)) {
            suggestions.add(Map.of("level", "info", "msg", "Start by reproducing the bug in the reported environment. Check browser console and network logs for errors."));
            suggestions.add(Map.of("level", "info", "msg", "Write a failing test first — this confirms the bug and prevents regression."));
            if (!desc.contains("step") && !desc.contains("reproduce")) {
                suggestions.add(Map.of("level", "warning", "msg", "No reproduction steps in description — ask the reporter for specific steps to reproduce."));
            }
        } else if ("story".equals(type) || "task".equals(type)) {
            suggestions.add(Map.of("level", "info", "msg", "Break the work into small, reviewable commits. Each commit should represent one logical change."));
            suggestions.add(Map.of("level", "info", "msg", "Update the issue status as you progress — this keeps the team informed and the board accurate."));
            if (issue.getStoryPoints() != null && issue.getStoryPoints() >= 8) {
                suggestions.add(Map.of("level", "warning", "msg", "This is a large task (" + issue.getStoryPoints() + " SP). Consider creating a checklist in the description to track sub-tasks."));
            }
        }

        suggestions.add(Map.of("level", "info", "msg", "If blocked, mention the blocker in a comment and update the status. Don't let issues silently stall."));
        suggestions.add(Map.of("level", "info", "msg", "When done, add a brief comment summarizing the solution — this helps future developers and AI context."));

        return Map.of("suggestions", suggestions);
    }

    /**
     * AI Review for editing — analyzes the updated title/description and provides feedback.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> aiReviewEdit(String issueId, UpdateIssueRequest req) {
        Issue issue = issueRepo.selectById(issueId);
        if (issue != null) enforceProject(issue.getProjectId(), "PROJECT:VIEW_AI_ANALYSIS");
        return aiReview(new CreateIssueRequest(
            issueRepo.selectById(issueId).getProjectId(),
            req.title(), req.description(), null,
            req.priority(), req.assigneeId(), req.storyPoints(),
            null, null, req.labels(), null, null, req.remainingPoints(), req.phase()
        ));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> aiReview(CreateIssueRequest req) {
        if (req.projectId() != null && !req.projectId().isBlank()) {
            enforceProject(req.projectId(), "PROJECT:VIEW_AI_ANALYSIS");
        }
        var notes = new ArrayList<Map<String, String>>();
        var suggestions = new ArrayList<Map<String, String>>();
        int score = 0;

        String title = req.title() != null ? req.title().trim() : "";
        if (title.isEmpty()) {
            notes.add(Map.of("level", "danger", "msg", "Title is empty. Every issue needs a clear title."));
        } else if (title.length() < 10) {
            notes.add(Map.of("level", "warning", "msg", "Title is too short (" + title.length() + " chars). A good title clearly states the problem or task."));
            suggestions.add(Map.of("level", "improve", "field", "title",
                "msg", "Expand the title to be more descriptive."));
        } else {
            notes.add(Map.of("level", "good", "msg", "Title is clear and descriptive."));
            score += 20;
        }

        String desc = req.description() != null ? req.description().trim() : "";
        if (desc.isEmpty()) {
            notes.add(Map.of("level", "warning", "msg", "No description provided."));
            suggestions.add(Map.of("level", "improve", "field", "description",
                "msg", "Add: 1) What needs to change, 2) Why it matters, 3) Acceptance criteria."));
        } else if (desc.length() > 30) {
            notes.add(Map.of("level", "good", "msg", "Description has sufficient detail (" + desc.length() + " chars)."));
            score += 20;
        }

        if ("critical".equalsIgnoreCase(req.priority()) && (req.assigneeId() == null || req.assigneeId().isBlank())) {
            notes.add(Map.of("level", "danger", "msg", "Critical priority issue has no assignee."));
        } else if (req.assigneeId() != null && !req.assigneeId().isBlank()) {
            score += 15;
        }

        if (req.storyPoints() == null || req.storyPoints() <= 0) {
            suggestions.add(Map.of("level", "info", "field", "storyPoints", "msg", "Add a story point estimate for sprint planning."));
        } else if (req.storyPoints() > 13) {
            notes.add(Map.of("level", "warning", "msg", "Story points > 13 — consider splitting."));
        } else {
            score += 10;
        }

        if (req.labels() == null || req.labels().isBlank()) {
            suggestions.add(Map.of("level", "info", "field", "labels", "msg", "Add labels to improve searchability."));
        }

        String verdict = score >= 50 ? "Ready" : score >= 30 ? "Needs minor improvements" : "Needs more detail";

        return Map.of("score", score, "maxScore", 65, "verdict", verdict, "notes", notes, "suggestions", suggestions);
    }
}
