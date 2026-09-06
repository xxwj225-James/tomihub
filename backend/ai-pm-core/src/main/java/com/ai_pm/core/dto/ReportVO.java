package com.ai_pm.core.dto;

import com.ai_pm.core.entity.Report;
import java.time.Instant;

public record ReportVO(
    String id,
    String generatedBy,
    String projectId,
    String reportType,
    String title,
    String content,
    String originalContent,
    String context,
    String status,
    String sentTo,
    String dismissedBy,
    Instant generatedAt,
    Instant sentAt,
    Instant createdAt
) {
    public static ReportVO from(Report report) {
        return new ReportVO(
            report.getId(),
            report.getGeneratedBy(),
            report.getProjectId(),
            report.getReportType(),
            report.getTitle(),
            report.getContent(),
            report.getOriginalContent(),
            report.getContext(),
            report.getStatus(),
            report.getSentTo(),
            report.getDismissedBy(),
            report.getGeneratedAt(),
            report.getSentAt(),
            report.getCreatedAt()
        );
    }
}
