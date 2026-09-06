package com.ai_pm.core.controller;

import com.ai_pm.common.security.RequirePermission;
import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.entity.IssueSecurityLevel;
import com.ai_pm.core.service.IssueSecurityService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/security-levels")
@RequiredArgsConstructor
@Validated
public class IssueSecurityController {

    private final IssueSecurityService securityService;

    @GetMapping
    @RequirePermission("PROJECT:BROWSE")
    public ApiResponse<List<IssueSecurityLevel>> list(@PathVariable String projectId) {
        return ApiResponse.success(securityService.listLevels(projectId));
    }

    @PostMapping
    @RequirePermission("PROJECT:SET_SECURITY_LEVEL")
    public ApiResponse<IssueSecurityLevel> create(
            @PathVariable String projectId,
            @Valid @RequestBody CreateSecurityLevel req) {
        return ApiResponse.success(
            securityService.createLevel(projectId, req.name(), req.description(), req.rank()));
    }

    @DeleteMapping("/{levelId}")
    @RequirePermission("PROJECT:SET_SECURITY_LEVEL")
    public ApiResponse<Void> delete(@PathVariable String projectId,
                                     @PathVariable String levelId) {
        securityService.deleteLevel(levelId);
        return ApiResponse.success(null);
    }

    @PostMapping("/{levelId}/members")
    @RequirePermission("PROJECT:SET_SECURITY_LEVEL")
    public ApiResponse<Void> addMember(@PathVariable String projectId,
                                        @PathVariable String levelId,
                                        @Valid @RequestBody AddMember req) {
        securityService.addMember(levelId, req.userId(), req.roleId());
        return ApiResponse.success(null);
    }

    @DeleteMapping("/{levelId}/members")
    @RequirePermission("PROJECT:SET_SECURITY_LEVEL")
    public ApiResponse<Void> removeMember(@PathVariable String projectId,
                                           @PathVariable String levelId,
                                           @Valid @RequestBody AddMember req) {
        securityService.removeMember(levelId, req.userId(), req.roleId());
        return ApiResponse.success(null);
    }

    // ─── DTOs ───

    public record CreateSecurityLevel(
        @NotBlank String name,
        String description,
        Integer rank
    ) {}

    public record AddMember(
        String userId,
        String roleId
    ) {}
}
