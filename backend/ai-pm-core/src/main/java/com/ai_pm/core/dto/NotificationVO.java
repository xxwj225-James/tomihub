package com.ai_pm.core.dto;

import com.ai_pm.core.entity.Notification;
import java.time.Instant;

public record NotificationVO(
    String id,
    String type,
    String subtype,
    String targetUserId,
    String title,
    String body,
    String sourceUserId,
    String sourceAgent,
    String sourceType,
    String issueKey,
    String issueTitle,
    String projectId,
    String link,
    String actionType,
    String actionPayload,
    String status,
    String clientRequestId,
    Instant expiresAt,
    Instant resolvedAt,
    String resolvedBy,
    Instant readAt,
    Integer version,
    Instant createdAt
) {
    public static NotificationVO from(Notification notification) {
        return new NotificationVO(
            notification.getId(),
            notification.getType(),
            notification.getSubtype(),
            notification.getTargetUserId(),
            notification.getTitle(),
            notification.getBody(),
            notification.getSourceUserId(),
            notification.getSourceAgent(),
            notification.getSourceType(),
            notification.getIssueKey(),
            notification.getIssueTitle(),
            notification.getProjectId(),
            notification.getLink(),
            notification.getActionType(),
            notification.getActionPayload(),
            notification.getStatus(),
            notification.getClientRequestId(),
            notification.getExpiresAt(),
            notification.getResolvedAt(),
            notification.getResolvedBy(),
            notification.getReadAt(),
            notification.getVersion(),
            notification.getCreatedAt()
        );
    }
}
