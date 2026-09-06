package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.entity.HitlConfig;
import com.ai_pm.core.service.HitlConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/hitl-config")
@RequiredArgsConstructor
@Validated
public class HitlConfigController {

    private final HitlConfigService service;

    @GetMapping
    public ApiResponse<List<HitlConfig>> list() {
        return ApiResponse.success(service.listByUser());
    }

    @PutMapping
    public ApiResponse<HitlConfig> save(@RequestBody SaveRequest req) {
        return ApiResponse.success(service.save(req.agentName(), req.mode(), req.isGlobalEnabled()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable("id") String id) {
        service.delete(id);
        return ApiResponse.success("Deleted", null);
    }

    public record SaveRequest(String agentName, String mode, Boolean isGlobalEnabled) {}
}
