package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("ai_training_pairs")
public class AiTrainingPair {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String tenantId;
    private String resourceId;
    private String taskType;
    private String inputPrompt;
    private String correctOutput;
    private String aiOutput;
    private Double qualityScore;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
