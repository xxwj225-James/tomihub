package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;
import java.util.List;

@Data
@TableName("roles")
public class Role {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String name;
    private String description;
    private String scope;        // global | project
    private Boolean isSystem;    // system roles cannot be deleted

    @TableField(exist = false)
    private List<String> permissionCodes;  // joined from role_permissions

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
