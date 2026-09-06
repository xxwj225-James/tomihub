package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("knowledge_pages")
public class KnowledgePage {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String projectId;
    private String title;
    private String content;
    private String category;
    private String status;
    private Boolean isSample;
    private String createdBy;
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;

    /** Updated on page open (GET /{id}) — powers the "last accessed" sort. */
    private Instant lastAccessedAt;

    /** Display name of the creator (filled on list, not a table column). */
    @TableField(exist = false)
    private String createdByName;
}
