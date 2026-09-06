package com.ai_pm.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("tenants")
public class Tenant {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String name;
    private String slug;
    private String logoUrl;
    private String plan;
    private String registrationMode;  // open | invite_only
    private String settings;   // JSON string
    private Boolean isActive;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
