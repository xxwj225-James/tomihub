package com.ai_pm.core.dto;

import com.ai_pm.core.entity.Sprint;
import java.time.Instant;
import java.time.LocalDate;

public record SprintVO(
    String id,
    String projectId,
    String name,
    String goal,
    LocalDate startDate,
    LocalDate endDate,
    String status,
    Instant startedAt,
    Instant completedAt,
    Instant createdAt
) {
    public static SprintVO from(Sprint sprint) {
        return new SprintVO(
            sprint.getId(),
            sprint.getProjectId(),
            sprint.getName(),
            sprint.getGoal(),
            sprint.getStartDate(),
            sprint.getEndDate(),
            sprint.getStatus(),
            sprint.getStartedAt(),
            sprint.getCompletedAt(),
            sprint.getCreatedAt()
        );
    }
}
