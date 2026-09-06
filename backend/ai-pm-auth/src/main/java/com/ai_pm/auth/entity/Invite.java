package com.ai_pm.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("invites")
public class Invite {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String email;
    private String code;
    private String role;
    private String invitedBy;
    private Instant expiresAt;
    private Instant acceptedAt;
    private String status;       // pending | accepted | expired | revoked

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
