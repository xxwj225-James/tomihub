package com.ai_pm.core.dto;

import com.ai_pm.core.entity.ProjectMember;
import java.time.Instant;

public record ProjectMemberVO(
    String id,
    String projectId,
    String userId,
    String role,
    String roleId,
    Instant joinedAt,
    String displayName,
    String email
) {
    public static ProjectMemberVO from(ProjectMember member) {
        return new ProjectMemberVO(
            member.getId(),
            member.getProjectId(),
            member.getUserId(),
            member.getRole(),
            member.getRoleId(),
            member.getJoinedAt(),
            member.getDisplayName(),
            member.getEmail()
        );
    }
}
