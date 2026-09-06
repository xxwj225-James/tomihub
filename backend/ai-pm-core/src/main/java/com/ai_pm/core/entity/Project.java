package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("projects")
public class Project {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String name;
    @TableField("\"key\"")
    private String key;
    private String description;
    private String leadId;
    private String visibility;
    private String status;
    private String phase;
    private String settings;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
