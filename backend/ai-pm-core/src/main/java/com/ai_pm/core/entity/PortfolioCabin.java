package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("portfolio_cabins")
public class PortfolioCabin {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String tenantId;
    private String name;
    private String description;
    private String createdBy;
    private String status;      // open / closed / archived
    private Instant closedAt;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
