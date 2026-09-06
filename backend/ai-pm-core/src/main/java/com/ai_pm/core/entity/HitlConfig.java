package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("hitl_configs")
public class HitlConfig {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String userId;

    /** null = global default; "claude-code", "feishu-bot", etc. = per-agent */
    private String agentName;

    /** "manual" = require user confirm; "auto" = execute directly */
    private String mode;

    /** true = global override ON (all agents use global mode, per-agent ignored) */
    private Boolean isGlobalEnabled;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
