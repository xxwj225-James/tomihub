package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;
import java.time.LocalDate;

@Data
@TableName("sprints")
public class Sprint {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String projectId;
    private String name;
    private String goal;
    private LocalDate startDate;
    private LocalDate endDate;
    private String status;    // planning, active, completed

    private Instant startedAt;
    private Instant completedAt;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
