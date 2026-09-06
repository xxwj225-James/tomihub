package com.ai_pm.core.dto;

import com.ai_pm.core.entity.Project;
import java.time.Instant;

public record ProjectVO(
    String id,
    String name,
    String key,
    String description,
    String leadId,
    String visibility,
    String status,
    String phase,
    String settings,
    Instant createdAt,
    Instant updatedAt
) {
    public static ProjectVO from(Project project) {
        return new ProjectVO(
            project.getId(),
            project.getName(),
            project.getKey(),
            project.getDescription(),
            project.getLeadId(),
            project.getVisibility(),
            project.getStatus(),
            project.getPhase(),
            project.getSettings(),
            project.getCreatedAt(),
            project.getUpdatedAt()
        );
    }
}
