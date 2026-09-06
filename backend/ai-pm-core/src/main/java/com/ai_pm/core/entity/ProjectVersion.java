package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("versions")
public class ProjectVersion {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String projectId;
    private String name;
    private String description;
    private Instant startDate;
    private Instant releaseDate;
    private String status;       // planned | active | released | cancelled
    private String category;     // milestone | release | sprint
    private Integer sortOrder;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
