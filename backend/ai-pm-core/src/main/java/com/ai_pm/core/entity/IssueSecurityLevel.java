package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;
import java.util.List;

@Data
@TableName("issue_security_levels")
public class IssueSecurityLevel {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String projectId;
    private String name;
    private String description;
    private Integer rank;
    private Boolean isDefault;

    @TableField(exist = false)
    private List<SecurityMember> members;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @Data
    public static class SecurityMember {
        private String id;
        private String securityLevelId;
        private String userId;
        private String roleId;
    }
}
