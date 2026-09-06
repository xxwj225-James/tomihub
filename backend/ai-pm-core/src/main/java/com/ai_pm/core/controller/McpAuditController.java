package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.entity.McpAuditLog;
import com.ai_pm.core.entity.McpHitlTask;
import com.ai_pm.core.service.McpAuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/mcp-audit")
@RequiredArgsConstructor
@Validated
public class McpAuditController {

    private final McpAuditService auditService;

    /** GET — returns completed audit log entries */
    @GetMapping
    public ApiResponse<List<McpAuditLog>> list() {
        return ApiResponse.success(auditService.listAuditLogs());
    }

    /** POST — record a new audit entry (called by MCP server) */
    @PostMapping
    public ApiResponse<McpAuditLog> record(@RequestBody Map<String, Object> body) {
        return ApiResponse.success(auditService.recordAudit(
            str(body, "status"),
            str(body, "tool"),
            str(body, "agentName"),
            str(body, "userId"),
            str(body, "issueKey"),
            str(body, "arguments")
        ));
    }

    /** GET /tasks — list pending HITL tasks for the current tenant */
    @GetMapping("/tasks")
    public ApiResponse<List<McpHitlTask>> listPendingTasks() {
        return ApiResponse.success(auditService.listPendingTasks());
    }

    /** POST /tasks — create a pending HITL task (called by MCP server). Returns the created task including its DB id. */
    @PostMapping("/tasks")
    public ApiResponse<McpHitlTask> createPendingTask(@RequestBody Map<String, Object> body) {
        return ApiResponse.success(auditService.createPendingTask(
            str(body, "tool_name"),
            str(body, "arguments"),
            str(body, "agent_name"),
            str(body, "user_id"),
            str(body, "issue_key"),
            str(body, "issue_title"),
            longOrNull(body, "expires_at")
        ));
    }

    /** POST /tasks/{id}/confirm — approve or deny a pending task (browser user only) */
    @PostMapping("/tasks/{id}/confirm")
    public ApiResponse<McpAuditLog> confirmTask(@PathVariable("id") String id,
                                                 @RequestBody Map<String, String> body) {
        return ApiResponse.success(auditService.confirmTask(id, body.get("action")));
    }

    private static String str(Map<String, Object> body, String key) {
        Object v = body.get(key);
        return v != null ? v.toString() : null;
    }

    private static Long longOrNull(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(v.toString()); } catch (NumberFormatException e) { return null; }
    }
}
