package com.ai_pm.core.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record DbConfigDto(
    @NotBlank String host,
    @Min(1) @Max(65535) int port,
    @NotBlank String databaseName,
    @NotBlank String username,
    String password
) {}
