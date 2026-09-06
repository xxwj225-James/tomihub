package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("cabin_entries")
public class CabinEntry {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String tenantId;
    private String cabinId;
    private String projectId;
    private String phase;
    private String attachedBy;
    private Instant attachedAt;

    @TableField(exist = false)
    private String projectName;
    @TableField(exist = false)
    private String projectKey;
}
