package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.entity.LlmConfig;
import com.ai_pm.core.service.LlmConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/llm-config")
@RequiredArgsConstructor
@Validated
public class LlmConfigController {

    private final LlmConfigService configService;

    @GetMapping
    public ApiResponse<LlmConfig> get() {
        return ApiResponse.success(configService.getOrCreate());
    }

    @PutMapping
    public ApiResponse<LlmConfig> save(@RequestBody LlmConfig input) {
        return ApiResponse.success(configService.save(input));
    }

    @PostMapping("/toggle-service")
    public ApiResponse<LlmConfig> toggleService(@RequestBody Map<String, Boolean> body) {
        boolean enabled = body.getOrDefault("enabled", true);
        return ApiResponse.success(configService.toggleService(enabled));
    }

    @PostMapping("/test-connection")
    public ApiResponse<String> testConnection(@RequestBody(required = false) LlmConfig input) {
        LlmConfig cfg = input != null && input.getBackend() != null ? input : configService.getOrCreate();
        log.info("test-connection: backend={} flash={} pro={} embed={}", cfg.getBackend(), cfg.getCloudFlashModel(), cfg.getCloudProModel(), cfg.getEmbeddingModel());
        try {
            String result;
            if ("ollama".equals(cfg.getBackend())) {
                result = testOllama(cfg);
            } else {
                result = testCloud(cfg);
            }
            // Embedding test — unified, route by model name not backend
            String embedResult = testEmbedding(cfg);
            if (!embedResult.contains("OK"))
                result = embedResult + result;
            else
                result += embedResult;
            return ApiResponse.success(result.replace("; ", "; ").trim());
        } catch (Exception e) {
            log.warn("LLM test connection failed: {}", e.getMessage());
            return ApiResponse.success("Connection failed — " + e.getMessage());
        }
    }

    private String testOllama(LlmConfig cfg) {
        if (cfg.getOllamaBaseUrl() == null || cfg.getOllamaBaseUrl().isBlank())
            return "Connection failed — Server Address is required; ";

        RestTemplate rt = new RestTemplate();
        String url = cfg.getOllamaBaseUrl();
        String missing = "";

        // Test flash model with real generate request
        if (cfg.getOllamaFlashModel() != null && !cfg.getOllamaFlashModel().isBlank()) {
            try {
                Map<String, Object> body = Map.of("model", cfg.getOllamaFlashModel(), "prompt", "hi", "stream", false);
                ResponseEntity<Map> r = rt.postForEntity(url + "/api/generate", body, Map.class);
                if (!r.getStatusCode().is2xxSuccessful())
                    missing += "Quick Tasks Model \"" + cfg.getOllamaFlashModel() + "\" error (" + r.getStatusCode().value() + "); ";
            } catch (Exception e) {
                missing += "Quick Tasks Model \"" + cfg.getOllamaFlashModel() + "\" failed: " + e.getMessage() + "; ";
            }
        } else {
            missing += "Quick Tasks Model not set; ";
        }

        // Test pro model with real generate request
        if (cfg.getOllamaProModel() != null && !cfg.getOllamaProModel().isBlank()) {
            try {
                Map<String, Object> body = Map.of("model", cfg.getOllamaProModel(), "prompt", "hi", "stream", false);
                ResponseEntity<Map> r = rt.postForEntity(url + "/api/generate", body, Map.class);
                if (!r.getStatusCode().is2xxSuccessful())
                    missing += "Heavy Tasks Model \"" + cfg.getOllamaProModel() + "\" error (" + r.getStatusCode().value() + "); ";
            } catch (Exception e) {
                missing += "Heavy Tasks Model \"" + cfg.getOllamaProModel() + "\" failed: " + e.getMessage() + "; ";
            }
        } else {
            missing += "Heavy Tasks Model not set; ";
        }

        return missing.isEmpty() ? "Connection successful; " : missing;
    }

    private String testCloud(LlmConfig cfg) {
        if (cfg.getCloudApiKey() == null || cfg.getCloudApiKey().isBlank())
            return "Connection failed — API Key is required; ";
        if (cfg.getCloudBaseUrl() == null || cfg.getCloudBaseUrl().isBlank())
            return "Connection failed — Base URL is required; ";

        RestTemplate rt = new RestTemplate();
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.setBearerAuth(cfg.getCloudApiKey());

        String missing = "";

        // Test flash model
        if (cfg.getCloudFlashModel() != null && !cfg.getCloudFlashModel().isBlank()) {
            try {
                Map<String, Object> body = Map.of("model", cfg.getCloudFlashModel(),
                    "messages", List.of(Map.of("role", "user", "content", "hi")), "max_tokens", 1);
                ResponseEntity<String> r = rt.exchange(cfg.getCloudBaseUrl() + "/chat/completions",
                    HttpMethod.POST, new HttpEntity<>(body, h), String.class);
                if (r.getStatusCode().value() == 401 || r.getStatusCode().value() == 403)
                    return "Connection failed — API Key rejected (401/403); ";
                if (!r.getStatusCode().is2xxSuccessful())
                    missing += "Quick Tasks Model \"" + cfg.getCloudFlashModel() + "\" error (" + r.getStatusCode().value() + "); ";
            } catch (Exception e) {
                missing += "Quick Tasks Model \"" + cfg.getCloudFlashModel() + "\" failed: " + e.getMessage() + "; ";
            }
        } else {
            missing += "Quick Tasks Model not set; ";
        }

        // Test pro model
        if (cfg.getCloudProModel() != null && !cfg.getCloudProModel().isBlank()) {
            try {
                Map<String, Object> body = Map.of("model", cfg.getCloudProModel(),
                    "messages", List.of(Map.of("role", "user", "content", "hi")), "max_tokens", 1);
                ResponseEntity<String> r = rt.exchange(cfg.getCloudBaseUrl() + "/chat/completions",
                    HttpMethod.POST, new HttpEntity<>(body, h), String.class);
                if (!r.getStatusCode().is2xxSuccessful())
                    missing += "Heavy Tasks Model \"" + cfg.getCloudProModel() + "\" error (" + r.getStatusCode().value() + "); ";
            } catch (Exception e) {
                missing += "Heavy Tasks Model \"" + cfg.getCloudProModel() + "\" failed: " + e.getMessage() + "; ";
            }
        } else {
            missing += "Heavy Tasks Model not set; ";
        }

        return missing.isEmpty() ? "Connection successful; " : "Connection successful; " + missing;
    }

    /** Embedding test — local Ollama only. Model must be pulled first (bge-m3 ships with ollama-embed). */
    private String testEmbedding(LlmConfig cfg) {
        if (cfg.getEmbeddingModel() == null || cfg.getEmbeddingModel().isBlank())
            return "Embedding Model not set; ";
        String url = cfg.getOllamaBaseUrl();
        if (url == null || url.isBlank())
            return "Embedding requires Ollama but Server Address not set; ";
        try {
            RestTemplate rt = new RestTemplate();
            Map<String, Object> body = Map.of("model", cfg.getEmbeddingModel(), "prompt", "test");
            ResponseEntity<Map> er = rt.postForEntity(url + "/api/embeddings", body, Map.class);
            if (!er.getStatusCode().is2xxSuccessful())
                return "Embedding test failed — HTTP " + er.getStatusCode().value() + "; ";
            if (er.getBody() == null || !er.getBody().containsKey("embedding"))
                return "Embedding test failed — no vector returned; ";
            return "Embedding test OK; ";
        } catch (Exception e) {
            return "Embedding test failed — " + e.getMessage() + "; ";
        }
    }
}
