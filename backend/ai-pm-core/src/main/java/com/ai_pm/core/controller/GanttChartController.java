package com.ai_pm.core.controller;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.entity.GanttChart;
import com.ai_pm.core.service.GanttChartService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/gantt-charts")
@RequiredArgsConstructor
@Validated
public class GanttChartController {

    private final GanttChartService service;

    @GetMapping
    public ApiResponse<List<GanttChart>> list(@RequestParam("projectId") String projectId) {
        String tenantId = TenantContextHolder.getTenantId();
        return ApiResponse.success(service.listByProject(tenantId, projectId));
    }

    @PostMapping
    public ApiResponse<GanttChart> create(@RequestBody Map<String, String> body) {
        String projectId = body.get("projectId");
        String title = body.get("title");
        String chartData = body.get("chartData");
        String rationale = body.get("rationale");
        return ApiResponse.success(service.create(projectId, title, chartData, rationale));
    }

    @PutMapping("/{id}")
    public ApiResponse<GanttChart> update(@PathVariable("id") Long id, @RequestBody Map<String, String> body) {
        return ApiResponse.success(service.update(id, body.get("chartData"), body.get("rationale")));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable("id") Long id) {
        service.deactivate(id);
        return ApiResponse.success(null);
    }
}
