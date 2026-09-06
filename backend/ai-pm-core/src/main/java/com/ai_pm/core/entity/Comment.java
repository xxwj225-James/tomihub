package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("comments")
public class Comment {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String issueId;
    private String authorId;
    private String authorName;
    private String body;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
