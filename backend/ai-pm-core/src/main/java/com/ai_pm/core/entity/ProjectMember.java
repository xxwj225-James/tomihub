package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("project_members")
public class ProjectMember {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String projectId;
    private String userId;
    private String role;
    private String roleId;

    @TableField(fill = FieldFill.INSERT)
    private Instant joinedAt;

    @TableField(exist = false)
    private String displayName;

    @TableField(exist = false)
    private String email;
}
