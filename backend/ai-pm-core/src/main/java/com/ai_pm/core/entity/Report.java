package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("reports")
public class Report {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String generatedBy;
    private String projectId;
    private String reportType;
    private String title;
    private String content;
    private String originalContent;
    private String context;      // JSONB — reads as text, inserts via custom SQL
    private String status;       // draft | sent
    private String sentTo;       // JSONB — reads as text, inserts via custom SQL
    private String dismissedBy;  // JSONB array — reads as text, inserts via custom SQL
    private Instant generatedAt;
    private Instant sentAt;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
