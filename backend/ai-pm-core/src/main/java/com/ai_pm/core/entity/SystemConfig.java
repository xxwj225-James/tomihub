package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("system_configs")
public class SystemConfig {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String key;
    private String value;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
