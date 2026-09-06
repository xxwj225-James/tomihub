package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.entity.McpAuditLog;
import com.ai_pm.core.entity.McpHitlTask;
import com.ai_pm.core.repository.McpAuditLogRepository;
import com.ai_pm.core.repository.McpHitlTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class McpAuditService {

    private final McpAuditLogRepository auditRepo;
    private final McpHitlTaskRepository taskRepo;

    // ─── Audit Log ───

    @Transactional(readOnly = true)
    public List<McpAuditLog> listAuditLogs() {
        return auditRepo.findByTenant(TenantContextHolder.getTenantId());
    }

    @Transactional
    public McpAuditLog recordAudit(String status, String tool, String agentName,
                                    String userId, String issueKey, String arguments) {
        McpAuditLog entry = new McpAuditLog();
        entry.setTenantId(TenantContextHolder.getTenantId());
        entry.setUserId(userId);
        entry.setToolName(tool);
        entry.setArguments(arguments != null ? arguments : "{}");
        entry.setStatus(status);
        entry.setResult("{}");
        entry.setConfirmedBy(TenantContextHolder.getUserId());
        entry.setIssueKey(issueKey);
        entry.setAgentName(agentName);
        auditRepo.insert(entry);
        return entry;
    }

    // ─── HITL Tasks ───

    @Transactional(readOnly = true)
    public List<McpHitlTask> listPendingTasks() {
        return taskRepo.findPendingByTenant(TenantContextHolder.getTenantId());
    }

    @Transactional
    public McpHitlTask createPendingTask(String toolName, String arguments, String agentName,
                                          String userId, String issueKey, String issueTitle,
                                          Long expiresAtEpoch) {
        McpHitlTask task = new McpHitlTask();
        task.setTenantId(TenantContextHolder.getTenantId());
        task.setUserId(userId);
        task.setToolName(toolName);
        task.setArguments(arguments != null ? arguments : "{}");
        task.setAgentName(agentName);
        task.setIssueKey(issueKey);
        task.setIssueTitle(issueTitle);
        task.setStatus("pending");
        if (expiresAtEpoch != null) {
            task.setExpiresAt(Instant.ofEpochSecond(expiresAtEpoch));
        }
        taskRepo.insert(task);
        return task;
    }

    @Transactional
    public McpAuditLog confirmTask(String taskId, String action) {
        String userId = TenantContextHolder.getUserId();
        String agentName = TenantContextHolder.getAgentName();
        if (agentName != null && !agentName.isBlank()) {
            throw new BusinessException(40300, "API Key cannot approve. Please use the browser interface.");
        }

        McpHitlTask task = taskRepo.findPendingById(taskId)
            .orElseThrow(() -> new BusinessException(40400, "Task not found or already resolved"));

        String newStatus = "approve".equals(action) ? "approved" : "denied";
        task.setStatus(newStatus);
        taskRepo.updateById(task);

        // Write to audit log
        McpAuditLog entry = recordAudit(newStatus, task.getToolName(),
            task.getAgentName(), task.getUserId(), task.getIssueKey(), task.getArguments());
        log.info("Task {} {}d: tool={}, agent={}, user={}",
            taskId, action, task.getToolName(), task.getAgentName(), userId);
        return entry;
    }
}
