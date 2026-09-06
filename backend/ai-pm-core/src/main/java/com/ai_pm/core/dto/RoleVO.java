package com.ai_pm.core.dto;

import com.ai_pm.core.entity.Role;
import java.time.Instant;
import java.util.List;

public record RoleVO(
    String id,
    String tenantId,
    String name,
    String description,
    String scope,
    Boolean isSystem,
    List<String> permissionCodes,
    Instant createdAt
) {
    public static RoleVO from(Role role) {
        return new RoleVO(
            role.getId(),
            role.getTenantId(),
            role.getName(),
            role.getDescription(),
            role.getScope(),
            role.getIsSystem(),
            role.getPermissionCodes(),
            role.getCreatedAt()
        );
    }
}
