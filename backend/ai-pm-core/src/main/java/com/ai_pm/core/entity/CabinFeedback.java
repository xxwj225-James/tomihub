package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("cabin_feedback")
public class CabinFeedback {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String documentId;
    private String cabinId;
    private String projectId;
    private String userId;
    private String feedback;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
