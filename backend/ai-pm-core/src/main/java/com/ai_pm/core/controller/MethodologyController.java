package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.repository.MethodologyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/methodologies")
@RequiredArgsConstructor
@Validated
public class MethodologyController {

    private final MethodologyRepository repo;

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list() {
        return ApiResponse.success(repo.findAll());
    }
}
