package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("issues")
public class Issue {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String projectId;
    private Integer issueNumber;
    private String title;
    private String description;
    private String type;
    private String status;
    private String priority;
    private String assigneeId;
    private String reporterId;

    @TableField(exist = false)
    private String assigneeName;
    private String sprintId;
    private String parentId;
    private Double sortOrder;
    private Double storyPoints;
    private Double remainingPoints;
    private Double workload;
    private String labels;
    /** Lifecycle phase (Discovery/Design/Implementation/Testing/Release) — Board "By Phase" view */
    private String phase;
    private java.time.LocalDate dueDate;
    /** Times this issue moved from a closed status back to open — risk signal (docs/55). */
    private Integer reopenCount;
    @TableField("security_level_id")
    private String securityLevel;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
