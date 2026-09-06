package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.repository.MasterDataRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/master-data")
@RequiredArgsConstructor
@Validated
public class MasterDataController {

    private final MasterDataRepository repo;

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list(@RequestParam("category") String category,
                                                        @RequestParam(name = "methodology", required = false) String methodology) {
        if (methodology != null && !methodology.isBlank()) {
            return ApiResponse.success(repo.findByCategoryAndMethodology(category, methodology));
        }
        return ApiResponse.success(repo.findByCategory(category));
    }
}
