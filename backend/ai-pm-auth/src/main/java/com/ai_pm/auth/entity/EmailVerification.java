package com.ai_pm.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("email_verifications")
public class EmailVerification {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String email;
    private String code;
    private String purpose;      // register | login | reset_password
    private Instant expiresAt;
    private Boolean used;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
