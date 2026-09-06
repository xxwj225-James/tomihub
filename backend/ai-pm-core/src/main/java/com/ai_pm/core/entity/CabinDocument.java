package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("cabin_documents")
public class CabinDocument {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String cabinId;
    private String content;
    private String healthData;       // JSONB → String
    private String dependencyData;   // JSONB → String
    private String summaryData;      // JSONB → String
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private Instant generatedAt;
}
