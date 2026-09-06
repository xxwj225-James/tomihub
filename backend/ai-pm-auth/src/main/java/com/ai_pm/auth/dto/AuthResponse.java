package com.ai_pm.auth.dto;

import java.util.List;

public record AuthResponse(
    UserVO user,
    TokenPair tokens,
    List<TenantVO> tenants,
    TenantVO currentTenant,
    boolean requireTenantSelection,
    boolean isFirstUser
) {
    public AuthResponse(UserVO user, TokenPair tokens, List<TenantVO> tenants,
                         TenantVO currentTenant, boolean requireTenantSelection) {
        this(user, tokens, tenants, currentTenant, requireTenantSelection, false);
    }
}
