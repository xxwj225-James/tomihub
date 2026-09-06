package com.ai_pm.core.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public class RoleRequest {

    public record Create(
        @NotBlank String name,
        @NotBlank String scope,     // global | project
        String description,
        @NotEmpty List<String> permissionCodes
    ) {}

    public record Update(
        String name,
        String description,
        List<String> permissionCodes
    ) {}

    public record AssignMember(
        @NotBlank String userId,
        @NotBlank String roleId
    ) {}
}
