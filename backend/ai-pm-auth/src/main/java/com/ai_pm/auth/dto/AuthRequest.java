package com.ai_pm.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class AuthRequest {

    public record SendCode(
        @Email @NotBlank String email,
        @NotBlank String purpose   // register | login | reset_password
    ) {}

    public record Register(
        @Email @NotBlank String email,
        String code,  // only required for invited users (validated in service layer)
        @NotBlank @Size(min = 8, max = 72) String password,
        @NotBlank @Size(min = 1, max = 100) String displayName,
        String inviteCode,     // optional: personal invite
        String joinLink,       // optional: reusable join link
        String workspaceName   // optional: workspace name (when no inviteCode)
    ) {}

    public record Login(
        @Email @NotBlank String email,
        @NotBlank String password,
        boolean rememberMe
    ) {}

    public record SelectTenant(
        @NotBlank String tenantId
    ) {}

    public record RefreshToken(
        @NotBlank String refreshToken
    ) {}
}
