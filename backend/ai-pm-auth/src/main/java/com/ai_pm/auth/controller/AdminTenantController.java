package com.ai_pm.auth.controller;

import com.ai_pm.auth.service.TenantProvisioningService;
import com.ai_pm.auth.service.TenantProvisioningService.ProvisionRequest;
import com.ai_pm.auth.service.TenantProvisioningService.ProvisionResult;
import com.ai_pm.common.web.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/tenants")
@RequiredArgsConstructor
@Validated
public class AdminTenantController {

    private final TenantProvisioningService provisioningService;

    /**
     * Mode B: Platform admin provisions a new tenant with an initial admin account.
     */
    @PostMapping
    public ApiResponse<ProvisionResult> provision(@Valid @RequestBody ProvisionBody req) {
        ProvisionResult result = provisioningService.provisionTenant(
            new ProvisionRequest(req.companyName(), req.slug(),
                                 req.adminEmail(), req.adminName(), req.plan()));
        return ApiResponse.success(result);
    }

    public record ProvisionBody(
        @NotBlank String companyName,
        @NotBlank String slug,
        @Email @NotBlank String adminEmail,
        @NotBlank String adminName,
        String plan
    ) {}
}
