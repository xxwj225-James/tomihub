package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.service.SystemConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/system-configs")
@RequiredArgsConstructor
@Validated
public class SystemConfigController {

    private final SystemConfigService configService;

    @GetMapping
    public ApiResponse<Map<String, String>> list() {
        return ApiResponse.success(configService.listByTenant());
    }

    @PutMapping
    public ApiResponse<Void> saveAll(@RequestBody Map<String, String> configs) {
        configService.saveAll(configs);
        return ApiResponse.success("ok", null);
    }
}
