package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("llm_config")
public class LlmConfig {
    @TableId
    private String tenantId;

    private String backend;
    private String ollamaBaseUrl;
    private String ollamaFlashModel;
    private String ollamaProModel;
    private String embeddingModel;
    private String cloudProvider;
    private String cloudBaseUrl;
    private String cloudApiKey;
    private String cloudFlashModel;
    private String cloudProModel;
    private Integer flashTimeout;
    private Integer proTimeout;
    private Boolean serviceEnabled;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
