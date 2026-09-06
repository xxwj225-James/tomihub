package com.ai_pm.core.dto;

import com.ai_pm.core.entity.Comment;
import java.time.Instant;

public record CommentVO(
    String id,
    String issueId,
    String authorId,
    String authorName,
    String body,
    Instant createdAt
) {
    public static CommentVO from(Comment comment) {
        return new CommentVO(
            comment.getId(),
            comment.getIssueId(),
            comment.getAuthorId(),
            comment.getAuthorName(),
            comment.getBody(),
            comment.getCreatedAt()
        );
    }
}
