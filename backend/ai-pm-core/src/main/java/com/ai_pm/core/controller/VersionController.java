package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.entity.ProjectVersion;
import com.ai_pm.core.service.VersionService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/versions")
@RequiredArgsConstructor
@Validated
public class VersionController {

    private final VersionService versionService;

    @GetMapping
    public ApiResponse<List<ProjectVersion>> list(@PathVariable("projectId") String projectId) {
        return ApiResponse.success(versionService.listByProject(projectId));
    }

    @PostMapping
    public ApiResponse<ProjectVersion> create(@PathVariable("projectId") String projectId,
                                        @RequestBody Map<String, Object> body) {
        return ApiResponse.success(versionService.create(projectId, body));
    }

    @PutMapping("/{id}")
    public ApiResponse<ProjectVersion> update(@PathVariable("projectId") String projectId,
                                        @PathVariable("id") String id,
                                        @RequestBody Map<String, Object> body) {
        return ApiResponse.success(versionService.update(projectId, id, body));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable("projectId") String projectId,
                                     @PathVariable("id") String id) {
        versionService.delete(projectId, id);
        return ApiResponse.success("Deleted", null);
    }
}
