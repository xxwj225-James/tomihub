package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.IssueVO;
import com.ai_pm.core.service.IssueService;
import com.ai_pm.core.service.IssueService.CreateIssueRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/issues")
@RequiredArgsConstructor
@Validated
public class IssueController {

    private final IssueService issueService;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    @PostMapping
    public ApiResponse<IssueVO> create(@Valid @RequestBody CreateIssueBody req) {
        return ApiResponse.success(IssueVO.from(issueService.create(new CreateIssueRequest(
            req.projectId(), req.title(), req.description(), req.type(),
            req.priority(), req.assigneeId(), req.storyPoints(),
            req.sprintId(), req.parentId(), req.labels(), req.securityLevel(),
            req.workload(), req.remainingPoints(), req.phase()
        ))));
    }

    @GetMapping("/my-tasks")
    public ApiResponse<?> myTasks(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.success(issueService.listMyTasksPaged(page, Math.min(size, 200)).map(IssueVO::from));
    }

    @GetMapping("/created-by-me")
    public ApiResponse<?> createdByMe(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.success(issueService.listCreatedByMePaged(page, Math.min(size, 200)).map(IssueVO::from));
    }

    @GetMapping
    public ApiResponse<?> list(@RequestParam("projectId") String projectId,
                               @RequestParam(defaultValue = "1") int page,
                               @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.success(issueService.listByProjectPaged(projectId, page, Math.min(size, 200)).map(IssueVO::from));
    }

    @GetMapping("/board-metrics")
    public ApiResponse<List<Map<String, Object>>> boardMetrics(@RequestParam("projectId") String projectId) {
        String sql = """
            SELECT i.id, i.issue_number, i.complexity_score,
                   (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id) as comment_count,
                   (SELECT COUNT(*) FROM issue_changelog cl WHERE cl.issue_id = i.id AND cl.field = 'status' AND cl.new_value = 'todo') as reopen_count
            FROM issues i WHERE i.project_id = ?
            """;
        return ApiResponse.success(jdbc.queryForList(sql, projectId));
    }

    @GetMapping("/{id}")
    public ApiResponse<IssueVO> get(@PathVariable("id") String id) {
        return ApiResponse.success(IssueVO.from(issueService.getById(id)));
    }

    @PutMapping("/{id}")
    public ApiResponse<IssueVO> update(@PathVariable("id") String id,
                                      @RequestBody UpdateIssueBody body) {
        return ApiResponse.success(IssueVO.from(issueService.update(id, new IssueService.UpdateIssueRequest(
            body.title(), body.description(), body.status(), body.priority(),
            body.type(), body.assigneeId(), body.sprintId(),
            body.storyPoints(), body.workload(), body.labels(),
            body.remainingPoints(), body.phase()
        ))));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable("id") String id) {
        issueService.delete(id);
        return ApiResponse.success("Issue deleted", null);
    }

    // ─── Children ───

    @GetMapping("/{id}/children")
    public ApiResponse<List<IssueVO>> getChildren(@PathVariable("id") String id) {
        return ApiResponse.success(issueService.getChildren(id).stream().map(IssueVO::from).toList());
    }

    // ─── Ranking ───

    @PutMapping("/{id}/rank")
    public ApiResponse<Void> updateRank(@PathVariable("id") String id,
                                         @RequestBody RankBody body) {
        issueService.updateRank(id, body.beforeId(), body.afterId());
        return ApiResponse.success(null);
    }

    // ─── Permissions ───

    @GetMapping("/{id}/permissions")
    public ApiResponse<Map<String, Object>> permissions(@PathVariable("id") String id) {
        return ApiResponse.success(issueService.getPermissions(id));
    }

    // ─── AI Features ───

    @GetMapping("/{id}/similar")
    public ApiResponse<List<Map<String, Object>>> similarIssues(@PathVariable("id") String id) {
        return ApiResponse.success(issueService.findSimilarIssues(id));
    }

    @GetMapping("/{id}/risk")
    public ApiResponse<Map<String, Object>> riskAnalysis(@PathVariable("id") String id) {
        return ApiResponse.success(issueService.analyzeRisk(id));
    }

    @GetMapping("/{id}/suggestions")
    public ApiResponse<Map<String, Object>> solvingSuggestions(@PathVariable("id") String id) {
        return ApiResponse.success(issueService.getSolvingSuggestions(id));
    }

    @PostMapping("/{id}/ai-review-edit")
    public ApiResponse<Map<String, Object>> aiReviewEdit(@PathVariable("id") String id,
                                                          @RequestBody UpdateIssueBody body) {
        return ApiResponse.success(issueService.aiReviewEdit(id, new IssueService.UpdateIssueRequest(
            body.title(), body.description(), body.status(), body.priority(),
            body.type(), body.assigneeId(), body.sprintId(),
            body.storyPoints(), body.workload(), body.labels(),
            body.remainingPoints(), body.phase()
        )));
    }

    public record UpdateIssueBody(
        String title, String description, String status, String priority,
        String type, String assigneeId, String sprintId,
        Double storyPoints, Double workload, String labels,
        Double remainingPoints, String phase
    ) {}

    @PostMapping("/ai-review")
    public ApiResponse<Map<String, Object>> aiReview(@Valid @RequestBody CreateIssueBody req) {
        var result = issueService.aiReview(new CreateIssueRequest(
            req.projectId(), req.title(), req.description(), req.type(),
            req.priority(), req.assigneeId(), req.storyPoints(),
            req.sprintId(), req.parentId(), req.labels(), req.securityLevel(),
            req.workload(), req.remainingPoints(), req.phase()
        ));
        // Add similar issues check
        if (req.projectId() != null && req.title() != null) {
            var similar = issueService.findSimilarByTitle(req.projectId(), req.title());
            result.put("similarIssues", similar);
        }
        return ApiResponse.success(result);
    }

    @PostMapping("/ai-generate-description")
    public ApiResponse<Map<String, String>> generateDescription(@RequestBody Map<String, String> body) {
        return ApiResponse.success(issueService.generateDescription(
            body.get("prompt"), body.get("context")));
    }

    public record CreateIssueBody(
        @NotBlank String projectId,
        @NotBlank String title,
        String description,
        String type,
        String priority,
        String assigneeId,
        Double storyPoints,
        Double workload,
        String sprintId,
        String parentId,
        String labels,
        String securityLevel,
        Double remainingPoints,
        String phase
    ) {}

    public record RankBody(
        String beforeId,
        String afterId
    ) {}
}
