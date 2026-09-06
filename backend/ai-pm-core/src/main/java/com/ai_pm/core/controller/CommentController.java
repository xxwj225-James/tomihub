package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import com.ai_pm.core.dto.CommentVO;
import com.ai_pm.core.service.CommentService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Validated
public class CommentController {

    private final CommentService commentService;

    @GetMapping("/issues/{issueId}/comments")
    public ApiResponse<?> list(@PathVariable("issueId") String issueId,
                               @RequestParam(defaultValue = "1") int page,
                               @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.success(commentService.listByIssuePaged(issueId, page, Math.min(size, 200)).map(CommentVO::from));
    }

    @PostMapping("/issues/{issueId}/comments")
    public ApiResponse<CommentVO> add(@PathVariable("issueId") String issueId,
                                     @RequestBody AddCommentBody body) {
        return ApiResponse.success(CommentVO.from(commentService.add(issueId, body.body())));
    }

    @DeleteMapping("/comments/{id}")
    public ApiResponse<Void> delete(@PathVariable("id") String id) {
        commentService.delete(id);
        return ApiResponse.success("Comment deleted", null);
    }

    @PostMapping("/comments/ai-optimize")
    public ApiResponse<Map<String, Object>> aiOptimize(@RequestBody Map<String, String> body) {
        return ApiResponse.success(commentService.optimize(body.get("text")));
    }

    public record AddCommentBody(String body) {}
}
