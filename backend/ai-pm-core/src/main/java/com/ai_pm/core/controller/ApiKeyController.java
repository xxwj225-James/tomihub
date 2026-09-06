package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.entity.ApiKey;
import com.ai_pm.core.service.ApiKeyService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/api-keys")
@RequiredArgsConstructor
@Validated
public class ApiKeyController {

    private final ApiKeyService apiKeyService;

    @GetMapping
    public ApiResponse<List<ApiKey>> list() {
        return ApiResponse.success(apiKeyService.listByUser());
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> generate(@RequestBody GenerateRequest req) {
        return ApiResponse.success(apiKeyService.generate(req.name(), req.scopes(), req.hitlMode()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> revoke(@PathVariable("id") String id) {
        apiKeyService.revoke(id);
        return ApiResponse.success("Key revoked", null);
    }

    @PostMapping("/verify")
    public ApiResponse<Map<String, Object>> verify(@RequestBody Map<String, String> body) {
        return ApiResponse.success(apiKeyService.verify(body.get("key")));
    }

    public record GenerateRequest(String name, String scopes, String hitlMode) {}
}
