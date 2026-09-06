package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("ai_decision_feedbacks")
public class AiDecisionFeedback {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String tenantId;
    private String projectId;
    private String resourceId;
    private String featureType;
    private String aiOutput;
    private String humanAction;
    private String humanCorrectedOutput;
    private String context;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
