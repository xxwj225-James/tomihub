package com.ai_pm.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("join_links")
public class JoinLink {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String code;
    private String description;
    private String role;
    private Integer maxUses;
    private Integer useCount;
    private Boolean isActive;
    private Boolean requiresApproval;
    private String createdBy;
    private Instant expiresAt;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
