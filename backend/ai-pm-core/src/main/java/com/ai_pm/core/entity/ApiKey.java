package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("api_keys")
public class ApiKey {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String userId;
    private String name;
    private String keyPrefix;
    private String keyHash;
    private String scopes;
    private String hitlMode;  // "manual" | "auto" — per-key HITL setting
    private Instant lastUsedAt;
    private String deviceFingerprint;
    private String deviceName;
    private Instant deviceBoundAt;
    private Instant expiresAt;
    private Boolean isActive;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
