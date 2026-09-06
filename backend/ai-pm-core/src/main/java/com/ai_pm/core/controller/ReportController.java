package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.ReportVO;
import com.ai_pm.core.service.ReportService;
import com.ai_pm.core.service.ReportService.SendRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/reports")
@RequiredArgsConstructor
@Validated
public class ReportController {

    private final ReportService reportService;

    @GetMapping
    public ApiResponse<List<ReportVO>> list(@RequestParam(name = "status", required = false) String status,
                                           @RequestParam(name = "tab", required = false) String tab) {
        return ApiResponse.success(reportService.list(status, tab).stream().map(ReportVO::from).toList());
    }

    @GetMapping("/{id}")
    public ApiResponse<ReportVO> get(@PathVariable("id") String id) {
        return ApiResponse.success(ReportVO.from(reportService.getById(id)));
    }

    @PostMapping
    public ApiResponse<ReportVO> create(@RequestBody CreateBody body) {
        return ApiResponse.success(ReportVO.from(reportService.create(
            body.title(), body.reportType(), body.projectId(),
            body.content(), body.originalContent(), body.context())));
    }

    @PutMapping("/{id}")
    public ApiResponse<ReportVO> update(@PathVariable("id") String id,
                                       @RequestBody UpdateBody body) {
        return ApiResponse.success(ReportVO.from(reportService.update(id, body.title(), body.content())));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable("id") String id) {
        reportService.delete(id);
        return ApiResponse.success(null);
    }

    @PostMapping("/{id}/send")
    public ApiResponse<ReportVO> send(@PathVariable("id") String id,
                                     @RequestBody SendRequest req) {
        return ApiResponse.success(ReportVO.from(reportService.send(id, req)));
    }

    @PostMapping("/{id}/dismiss")
    public ApiResponse<Void> dismiss(@PathVariable("id") String id) {
        reportService.dismiss(id);
        return ApiResponse.success(null);
    }

    // ─── DTOs ───

    public record CreateBody(String title, String reportType, String projectId,
                              String content, String originalContent, String context) {}

    public record UpdateBody(String title, String content) {}
}
