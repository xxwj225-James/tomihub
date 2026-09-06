package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.ProjectMemberVO;
import com.ai_pm.core.service.ProjectMemberService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/members")
@RequiredArgsConstructor
@Validated
public class ProjectMemberController {

    private final ProjectMemberService memberService;

    @GetMapping
    public ApiResponse<?> list(@PathVariable("projectId") String projectId,
                               @RequestParam(defaultValue = "1") int page,
                               @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.success(memberService.listByProjectPaged(projectId, page, Math.min(size, 200)).map(ProjectMemberVO::from));
    }

    @PostMapping
    public ApiResponse<ProjectMemberVO> add(@PathVariable("projectId") String projectId,
                                           @RequestBody Map<String, String> body) {
        return ApiResponse.success(ProjectMemberVO.from(memberService.add(projectId, body.get("userId"), body.get("role"))));
    }

    @PutMapping("/{userId}")
    public ApiResponse<ProjectMemberVO> updateRole(@PathVariable("projectId") String projectId,
                                                  @PathVariable("userId") String userId,
                                                  @RequestBody Map<String, String> body) {
        return ApiResponse.success(ProjectMemberVO.from(memberService.updateRole(projectId, userId, body.get("role"))));
    }

    @DeleteMapping("/{userId}")
    public ApiResponse<Void> remove(@PathVariable("projectId") String projectId,
                                     @PathVariable("userId") String userId) {
        memberService.remove(projectId, userId);
        return ApiResponse.success("Member removed", null);
    }
}
