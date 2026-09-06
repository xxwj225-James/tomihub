package com.ai_pm.core.event;

import com.ai_pm.core.repository.ProjectMemberRepository;
import com.ai_pm.core.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationListener {

    private final NotificationService notifService;
    private final ProjectMemberRepository memberRepo;
    private final SimpMessagingTemplate messaging;
    private static final List<String> PHASE_ORDER = List.of(
        "initiation", "planning", "development", "testing", "closure", "uat", "maintenance"
    );

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPhaseChanged(PhaseChangedEvent event) {
        // Guard: tenantId must not be null (ThreadLocal lost across @Async)
        if (event.getTenantId() == null) {
            log.error("PhaseChangedEvent.tenantId is null — cannot create notifications without tenant context");
            return;
        }
        com.ai_pm.common.context.TenantContextHolder.set(event.getTenantId(), "system");

        try {
            String phaseName = capitalize(event.getNewPhase());
            String emoji = event.isForward() ? "🎉" : "💪";
            String tone = event.isForward()
                ? "Great progress, keep up the excellent work!"
                : "Let's regroup and push forward together!";
            String title = emoji + " " + event.getProjectName() + ": Phase → " + phaseName;
            String body = event.getProjectName() + " has "
                        + (event.isForward() ? "advanced to" : "moved back to")
                        + " the **" + phaseName + "** phase! " + tone;

            var members = memberRepo.findByProjectId(event.getProjectId());
            Set<String> seenUsers = new HashSet<>();  // guard against duplicate members
            int sent = 0;

            for (var m : members) {
                if (!seenUsers.add(m.getUserId())) continue;  // skip duplicates

                var n = notifService.createOrReuse(Map.of(
                    "type", "project_update",
                    "title", title,
                    "body", body,
                    "projectId", event.getProjectId(),
                    "targetUserId", m.getUserId(),
                    "clientRequestId", "phase-" + event.getProjectId() + "-" + event.getEventId() + "-" + m.getUserId(),
                    "sourceAgent", "system"
                ));

                // STOMP push to the target user
                messaging.convertAndSendToUser(
                    m.getUserId(),
                    "/queue/notifications",
                    Map.of(
                        "id", n.getId(),
                        "type", n.getType(),
                        "title", n.getTitle(),
                        "body", n.getBody(),
                        "projectId", n.getProjectId(),
                        "status", n.getStatus(),
                        "createdAt", n.getCreatedAt() != null ? n.getCreatedAt().toString() : null
                    )
                );
                sent++;
            }
            log.info("Phase notification: {} members ({} unique) notified: {} → {}",
                     members.size(), sent, event.getProjectName(), phaseName);
        } catch (Exception e) {
            log.error("Failed to send phase notification: {}", e.getMessage(), e);
        } finally {
            com.ai_pm.common.context.TenantContextHolder.clear();
        }
    }

    private static String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }
}
