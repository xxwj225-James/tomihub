package com.ai_pm.core.dto;

import com.ai_pm.core.entity.Issue;
import java.time.Instant;
import java.time.LocalDate;

public record IssueVO(
    String id,
    String projectId,
    Integer issueNumber,
    String title,
    String description,
    String type,
    String status,
    String priority,
    String assigneeId,
    String assigneeName,
    String reporterId,
    String sprintId,
    String parentId,
    Double sortOrder,
    Double storyPoints,
    Double remainingPoints,
    Double workload,
    String labels,
    String phase,
    LocalDate dueDate,
    String securityLevel,
    Instant createdAt,
    Instant updatedAt
) {
    public static IssueVO from(Issue issue) {
        return new IssueVO(
            issue.getId(),
            issue.getProjectId(),
            issue.getIssueNumber(),
            issue.getTitle(),
            issue.getDescription(),
            issue.getType(),
            issue.getStatus(),
            issue.getPriority(),
            issue.getAssigneeId(),
            issue.getAssigneeName(),
            issue.getReporterId(),
            issue.getSprintId(),
            issue.getParentId(),
            issue.getSortOrder(),
            issue.getStoryPoints(),
            issue.getRemainingPoints(),
            issue.getWorkload(),
            issue.getLabels(),
            issue.getPhase(),
            issue.getDueDate(),
            issue.getSecurityLevel(),
            issue.getCreatedAt(),
            issue.getUpdatedAt()
        );
    }
}
