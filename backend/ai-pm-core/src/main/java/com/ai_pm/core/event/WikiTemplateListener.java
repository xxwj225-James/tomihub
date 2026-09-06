package com.ai_pm.core.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Listens for ProjectCreatedEvent and calls ai-brain to generate default wiki templates.
 * Fires AFTER transaction commit so the project record is visible.
 * @Async ensures HTTP response is not blocked.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WikiTemplateListener {

    private static final ObjectMapper mapper = new ObjectMapper();

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onProjectCreated(ProjectCreatedEvent event) {
        if (!event.isGenerateWiki()) {
            log.info("Wiki template generation skipped for project {} (generateWiki=false)", event.getProjectId());
            return;
        }

        log.info("Triggering wiki template generation for project {} ({})", event.getProjectId(), event.getProjectName());

        try {
            String json = mapper.writeValueAsString(Map.of(
                "projectId", event.getProjectId(),
                "tenantId", event.getTenantId(),
                "projectName", event.getProjectName(),
                "description", event.getProjectDescription() != null ? event.getProjectDescription() : ""
            ));

            // AI-BOUNDARY: protocol passthrough to ai-brain (closed-source).
            // Fires on ProjectCreatedEvent to generate default wiki templates.
            var url = URI.create("http://ai-brain-api:8000/api/v1/ai/init-project-wiki").toURL();
            var conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(120000); // 2 min — AI generation takes time

            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }

            if (conn.getResponseCode() == 200) {
                log.info("Wiki template generation completed for project {}", event.getProjectId());
            } else {
                String err = new String(conn.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
                log.warn("Wiki template generation failed for project {}: HTTP {} — {}",
                    event.getProjectId(), conn.getResponseCode(), err);
            }
        } catch (Exception e) {
            log.error("Wiki template generation error for project {}: {}", event.getProjectId(), e.toString());
        }
    }
}
