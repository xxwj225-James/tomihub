package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.repository.WorkflowRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/workflows")
@RequiredArgsConstructor
@Validated
public class WorkflowController {

    private final WorkflowRepository repo;

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list(@RequestParam(name = "methodology_id", required = false) String methodologyId) {
        if (methodologyId != null && !methodologyId.isBlank()) {
            return ApiResponse.success(repo.findByMethodology(methodologyId));
        }
        return ApiResponse.success(repo.findAll());
    }
}
