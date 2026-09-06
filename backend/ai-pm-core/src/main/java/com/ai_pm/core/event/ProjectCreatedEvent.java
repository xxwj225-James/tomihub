package com.ai_pm.core.event;

import lombok.Getter;
import java.util.UUID;

/**
 * Published when a new project is created.
 * WikiTemplateListener uses this to generate default wiki templates.
 */
@Getter
public class ProjectCreatedEvent {

    private final String eventId;
    private final String tenantId;
    private final String projectId;
    private final String projectName;
    private final String projectDescription;
    private final boolean generateWiki;

    public ProjectCreatedEvent(String tenantId, String projectId, String projectName,
                                String projectDescription, boolean generateWiki) {
        this.eventId = UUID.randomUUID().toString().replace("-", "");
        this.tenantId = tenantId;
        this.projectId = projectId;
        this.projectName = projectName;
        this.projectDescription = projectDescription;
        this.generateWiki = generateWiki;
    }
}
