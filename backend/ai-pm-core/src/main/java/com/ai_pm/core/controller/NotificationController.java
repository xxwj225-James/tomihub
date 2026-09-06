package com.ai_pm.core.controller;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.NotificationVO;
import com.ai_pm.core.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
@Validated
public class NotificationController {

    private final NotificationService notifService;

    /** GET — list notifications, optionally filtered by type and/or status */
    @GetMapping
    public ApiResponse<?> list(
            @RequestParam(name = "type", required = false) String type,
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.success(notifService.listPaged(type, status, page, Math.min(size, 200)).map(NotificationVO::from));
    }

    /** GET /{id} — get single notification */
    @GetMapping("/{id}")
    public ApiResponse<NotificationVO> get(@PathVariable("id") String id) {
        return ApiResponse.success(NotificationVO.from(notifService.getById(id)));
    }

    /** POST — create a new notification (idempotent via clientRequestId) */
    @PostMapping
    public ApiResponse<NotificationVO> create(@RequestBody Map<String, Object> body) {
        return ApiResponse.success(NotificationVO.from(notifService.createOrReuse(body)));
    }

    /** POST /{id}/resolve — approve/deny/dismiss (optimistic lock via @Version) */
    @PostMapping("/{id}/resolve")
    public ApiResponse<NotificationVO> resolve(@PathVariable("id") String id,
                                              @RequestBody Map<String, String> body) {
        String action = body.get("action");
        String resolvedBy = TenantContextHolder.getUserId();
        return ApiResponse.success(NotificationVO.from(notifService.resolve(id, action, resolvedBy)));
    }

    /** POST /{id}/read — mark as read */
    @PostMapping("/{id}/read")
    public ApiResponse<Void> markRead(@PathVariable("id") String id) {
        notifService.markRead(id);
        return ApiResponse.success("ok", null);
    }
}
