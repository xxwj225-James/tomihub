package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("notifications")
public class Notification {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String type;
    private String subtype;
    private String targetUserId;
    private String title;
    private String body;
    private String sourceUserId;
    private String sourceAgent;
    private String sourceType;
    private String issueKey;
    private String issueTitle;
    @TableField(exist = false)
    private String projectId;
    private String link;
    private String actionType;
    private String actionPayload;
    private String status;
    private String clientRequestId;
    private Instant expiresAt;
    private Instant resolvedAt;
    private String resolvedBy;
    private Instant readAt;

    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
