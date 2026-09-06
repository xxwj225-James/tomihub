package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.DbConfigDto;
import com.ai_pm.core.service.DbConfigService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/db-config")
@RequiredArgsConstructor
@Validated
public class DbConfigController {

    private final DbConfigService dbConfigService;

    @GetMapping
    public ApiResponse<?> get() {
        return ApiResponse.success(dbConfigService.get());
    }

    @PutMapping
    public ApiResponse<Void> save(@Valid @RequestBody DbConfigDto input) {
        dbConfigService.save(input);
        return ApiResponse.success("ok", null);
    }

    @PostMapping("/test-connection")
    public ApiResponse<String> testConnection(@Valid @RequestBody DbConfigDto input) {
        return ApiResponse.success(dbConfigService.testConnection(input));
    }

    @PostMapping("/stop-service")
    public ApiResponse<Void> stopService() {
        dbConfigService.stopService();
        return ApiResponse.success("ok", null);
    }

    @PostMapping("/restart-service")
    public ApiResponse<Void> restartService() {
        dbConfigService.restartService();
        return ApiResponse.success("ok", null);
    }

    @GetMapping("/status")
    public ApiResponse<String> getStatus() {
        return ApiResponse.success(dbConfigService.getStatus());
    }
}
