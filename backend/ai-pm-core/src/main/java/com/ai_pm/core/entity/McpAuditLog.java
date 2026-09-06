package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("mcp_audit_logs")
public class McpAuditLog {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String userId;
    private String toolName;
    private String arguments;
    private String status;
    private String result;
    private String confirmedBy;
    private String issueKey;
    private String agentName;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
