package com.ai_pm.auth.dto;

import com.ai_pm.auth.entity.Tenant;

public record TenantVO(
    String id,
    String name,
    String slug,
    String logoUrl,
    String role
) {
    public static TenantVO from(Tenant tenant, String role) {
        return new TenantVO(
            tenant.getId(), tenant.getName(), tenant.getSlug(),
            tenant.getLogoUrl(), role
        );
    }
}
