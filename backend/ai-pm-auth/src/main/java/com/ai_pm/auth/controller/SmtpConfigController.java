package com.ai_pm.auth.controller;

import com.ai_pm.auth.service.SmtpConfigService;
import com.ai_pm.auth.service.SmtpConfigService.SmtpConfig;
import com.ai_pm.common.web.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/smtp")
@RequiredArgsConstructor
@Validated
public class SmtpConfigController {

    private final SmtpConfigService smtpService;

    @GetMapping
    public ApiResponse<Map<String, Object>> getConfig() {
        SmtpConfig cfg = smtpService.getConfig();
        return ApiResponse.success(Map.of(
            "config", cfg,
            "presets", SmtpConfigService.PRESETS,
            "is_configured", cfg.host() != null && !cfg.host().isBlank()
        ));
    }

    @PutMapping
    public ApiResponse<SmtpConfig> updateConfig(@Valid @RequestBody SmtpUpdateRequest req,
                                                  HttpServletRequest httpReq) {
        String userId = (String) httpReq.getAttribute("userId");
        if (userId == null) userId = "admin";
        SmtpConfig updated = smtpService.updateConfig(
            new SmtpConfig(req.host(), req.port(), req.username(),
                           req.password(), req.starttls(), req.fromName()),
            userId
        );
        return ApiResponse.success(updated);
    }

    @PostMapping("/test")
    public ApiResponse<String> testConnection(@Valid @RequestBody SmtpUpdateRequest req) {
        // Attempt to connect and send a test email
        try {
            // Use JavaMailSender to test connection
            boolean ok = smtpService.testConnection(
                new SmtpConfig(req.host(), req.port(), req.username(),
                               req.password(), req.starttls(), req.fromName()));
            return ok
                ? ApiResponse.success("Connection successful")
                : ApiResponse.success("Connection failed — check credentials");
        } catch (Exception e) {
            return ApiResponse.success("Connection failed: " + e.getMessage());
        }
    }

    public record SmtpUpdateRequest(
        @NotBlank String host,
        int port,
        String username,
        String password,
        boolean starttls,
        String fromName
    ) {}
}
