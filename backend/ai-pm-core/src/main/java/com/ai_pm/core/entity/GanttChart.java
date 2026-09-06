package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("ai_gantt_charts")
public class GanttChart {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String tenantId;
    private String projectId;
    private String title;
    private String chartDataJsonb;
    private String aiRationale;
    private Boolean isActive;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
