package com.ai_pm.common.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("tenant_members")
public class TenantMember {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String tenantId;
    private String userId;
    private String role;
    private String status;  // active / disabled
    private Instant joinedAt;
}
