package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.SprintVO;
import com.ai_pm.core.service.SprintService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/sprints")
@RequiredArgsConstructor
@Validated
public class SprintController {

    private final SprintService service;

    @GetMapping
    public ApiResponse<?> list(@RequestParam("projectId") String projectId,
                               @RequestParam(defaultValue = "1") int page,
                               @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.success(service.listByProjectPaged(projectId, page, Math.min(size, 200)).map(SprintVO::from));
    }

    @PostMapping
    public ApiResponse<SprintVO> create(@RequestBody Map<String, String> body) {
        String projectId = body.get("projectId");
        String name = body.get("name");
        String goal = body.get("goal");
        LocalDate startDate = body.containsKey("startDate") ? LocalDate.parse(body.get("startDate")) : LocalDate.now();
        LocalDate endDate = body.containsKey("endDate") ? LocalDate.parse(body.get("endDate")) : LocalDate.now().plusWeeks(2);
        return ApiResponse.success(SprintVO.from(service.create(projectId, name, goal, startDate, endDate)));
    }

    @PostMapping("/{id}/start")
    public ApiResponse<SprintVO> start(@PathVariable("id") String id) {
        return ApiResponse.success(SprintVO.from(service.startSprint(id)));
    }

    @PostMapping("/{id}/complete")
    public ApiResponse<SprintVO> complete(@PathVariable("id") String id) {
        return ApiResponse.success(SprintVO.from(service.completeSprint(id)));
    }
}
