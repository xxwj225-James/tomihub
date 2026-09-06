package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("issue_changelog")
public class IssueChangelog {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String issueId;
    private String changedBy;
    private String field;
    private String oldValue;
    private String newValue;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
