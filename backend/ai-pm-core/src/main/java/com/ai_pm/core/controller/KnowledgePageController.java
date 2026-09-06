package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.entity.KnowledgePage;
import com.ai_pm.core.service.KnowledgePageService;
import com.ai_pm.core.service.KnowledgePageService.CreatePageRequest;
import com.ai_pm.core.service.KnowledgePageService.UpdatePageRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/wiki")
@RequiredArgsConstructor
@Validated
public class KnowledgePageController {

    private final KnowledgePageService kbService;

    @GetMapping
    public ApiResponse<List<KnowledgePage>> list(@PathVariable("projectId") String projectId,
                                                   @RequestParam(name = "category", required = false) String category) {
        if (category != null) return ApiResponse.success(kbService.listByCategory(projectId, category));
        return ApiResponse.success(kbService.listByProject(projectId));
    }

    @GetMapping("/{id}")
    public ApiResponse<KnowledgePage> get(@PathVariable("projectId") String projectId, @PathVariable("id") String id) {
        return ApiResponse.success(kbService.getAndTouch(id));
    }

    @PostMapping
    public ApiResponse<KnowledgePage> create(@PathVariable("projectId") String projectId,
                                               @Valid @RequestBody CreateBody req) {
        return ApiResponse.success(kbService.create(projectId,
            new CreatePageRequest(req.title(), req.content(), req.category(), req.status(), req.isSample())));
    }

    @PutMapping("/{id}")
    public ApiResponse<KnowledgePage> update(@PathVariable("projectId") String projectId, @PathVariable("id") String id,
                                               @Valid @RequestBody UpdateBody req) {
        return ApiResponse.success(kbService.update(id,
            new UpdatePageRequest(req.title(), req.content(), req.category(), req.status())));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable("projectId") String projectId, @PathVariable("id") String id) {
        kbService.delete(id);
        return ApiResponse.success(null);
    }

    public record CreateBody(@NotBlank String title, String content, String category, String status, Boolean isSample) {}
    public record UpdateBody(String title, String content, String category, String status) {}
}
