package com.ai_pm.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("refresh_tokens")
public class RefreshToken {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String userId;
    private String tokenHash;
    private String deviceName;
    private String deviceInfo;   // JSON string
    private String ipAddress;
    private Instant expiresAt;
    private Boolean revoked;
    private String replacedBy;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
