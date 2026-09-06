package com.ai_pm.core.controller;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.entity.*;
import com.ai_pm.core.service.CabinService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/cabins")
@RequiredArgsConstructor
@Validated
public class CabinController {

    private final CabinService cabinService;

    @GetMapping
    public ApiResponse<List<PortfolioCabin>> list() {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        return ApiResponse.success(cabinService.listByUser(tenantId, userId));
    }

    @GetMapping("/{id}")
    public ApiResponse<PortfolioCabin> get(@PathVariable String id) {
        return ApiResponse.success(cabinService.getById(id));
    }

    @PostMapping
    public ApiResponse<PortfolioCabin> create(@RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        String description = (String) body.get("description");
        @SuppressWarnings("unchecked")
        List<String> participantIds = (List<String>) body.get("participantIds");
        return ApiResponse.success(cabinService.create(name, description, participantIds));
    }

    @PutMapping("/{id}")
    public ApiResponse<PortfolioCabin> update(@PathVariable String id, @RequestBody Map<String, String> body) {
        return ApiResponse.success(cabinService.update(id,
            body.get("name"), body.get("description"), body.get("status")));
    }

    // ─── Participants ───

    @GetMapping("/{id}/participants")
    public ApiResponse<List<CabinParticipant>> participants(@PathVariable String id) {
        return ApiResponse.success(cabinService.listParticipants(id));
    }

    @PostMapping("/{id}/participants")
    public ApiResponse<CabinParticipant> addParticipant(@PathVariable String id, @RequestBody Map<String, String> body) {
        return ApiResponse.success(cabinService.addParticipant(
            id, body.get("userId"), body.getOrDefault("role", "participant")));
    }

    @PostMapping("/{id}/accept")
    public ApiResponse<Void> acceptInvite(@PathVariable String id) {
        String userId = TenantContextHolder.getUserId();
        cabinService.acceptInvite(id, userId);
        return ApiResponse.success("ok", null);
    }

    @PostMapping("/{id}/authorize")
    public ApiResponse<Void> authorize(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String userId = TenantContextHolder.getUserId();
        @SuppressWarnings("unchecked")
        List<String> projectIds = (List<String>) body.get("projectIds");
        cabinService.authorize(id, userId, projectIds != null ? projectIds : List.of());
        return ApiResponse.success("ok", null);
    }

    @DeleteMapping("/{id}/participants/{userId}")
    public ApiResponse<Void> removeParticipant(@PathVariable String id, @PathVariable String userId) {
        cabinService.removeParticipant(id, userId);
        return ApiResponse.success("ok", null);
    }

    // ─── Entries ───

    @GetMapping("/{id}/entries")
    public ApiResponse<List<CabinEntry>> entries(@PathVariable String id) {
        return ApiResponse.success(cabinService.listEntries(id));
    }

    @PostMapping("/{id}/entries")
    public ApiResponse<CabinEntry> attachProject(@PathVariable String id, @RequestBody Map<String, String> body) {
        return ApiResponse.success(cabinService.attachProject(
            id, body.get("projectId"), body.get("phase")));
    }

    @DeleteMapping("/{id}/entries/{entryId}")
    public ApiResponse<Void> detachProject(@PathVariable String id, @PathVariable String entryId) {
        cabinService.detachProject(id, entryId);
        return ApiResponse.success("ok", null);
    }

    // ─── Documents ───

    @GetMapping("/{id}/documents")
    public ApiResponse<List<CabinDocument>> listDocuments(@PathVariable String id) {
        return ApiResponse.success(cabinService.listDocuments(id));
    }

    @GetMapping("/{id}/document")
    public ApiResponse<CabinDocument> getDocument(@PathVariable String id) {
        return ApiResponse.success(cabinService.getLatestDocument(id));
    }

    @PostMapping("/{id}/document")
    public ApiResponse<CabinDocument> saveDocument(@PathVariable String id, @RequestBody Map<String, String> body) {
        return ApiResponse.success(cabinService.saveDocument(id,
            body.get("content"),
            body.get("healthData"),
            body.get("dependencyData"),
            body.get("summaryData")));
    }

    // ─── Feedback ───

    @GetMapping("/{id}/feedback")
    public ApiResponse<List<CabinFeedback>> listFeedback(@PathVariable String id) {
        return ApiResponse.success(cabinService.listFeedback(id));
    }

    @PostMapping("/{id}/feedback")
    public ApiResponse<CabinFeedback> addFeedback(@PathVariable String id, @RequestBody Map<String, String> body) {
        return ApiResponse.success(cabinService.addFeedback(id,
            body.get("documentId"), body.get("projectId"), body.get("feedback")));
    }
}
