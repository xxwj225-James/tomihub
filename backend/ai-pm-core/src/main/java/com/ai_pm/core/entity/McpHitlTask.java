package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("mcp_hitl_tasks")
public class McpHitlTask {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String userId;
    private String toolName;
    private String arguments;
    private String agentName;
    private String issueKey;
    private String issueTitle;
    private String status;
    private Instant expiresAt;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
