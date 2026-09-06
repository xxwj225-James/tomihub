package com.ai_pm.core.event;

import lombok.Getter;

import java.util.UUID;

/**
 * Published when a project's phase is changed.
 * Listeners react asynchronously (notifications, audit, etc.)
 *
 * eventId is a per-publication UUID — ensures idempotency prevents
 * double-processing of the SAME event while allowing distinct phase
 * changes (even to the same target phase) to create new notifications.
 */
@Getter
public class PhaseChangedEvent {

    private final String eventId;
    private final String tenantId;
    private final String projectId;
    private final String projectName;
    private final String oldPhase;
    private final String newPhase;
    private final boolean isForward;

    public PhaseChangedEvent(String tenantId, String projectId, String projectName,
                              String oldPhase, String newPhase, boolean isForward) {
        this.eventId = UUID.randomUUID().toString().replace("-", "");
        this.tenantId = tenantId;
        this.projectId = projectId;
        this.projectName = projectName;
        this.oldPhase = oldPhase;
        this.newPhase = newPhase;
        this.isForward = isForward;
    }
}
