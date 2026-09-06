package com.ai_pm.core.event;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

import java.util.Map;

/**
 * Published after issue/comment/project CRUD to trigger async embedding generation.
 * Serializes to snake_case JSON matching Python EventConsumer format.
 * Listener fires AFTER_COMMIT → RabbitMQ → Python consumer → _generate_embedding().
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record EmbeddingEvent(
    String tenantId,
    String projectId,
    String eventType,       // e.g. "issue.created", "comment.created", "project.updated"
    Actor actor,
    Resource resource,
    Map<String, Object> payload
) {
    public record Actor(String id, String displayName) {}
    public record Resource(String type, String id) {}

    /** Factory: issue event */
    public static EmbeddingEvent issueCreated(String tenantId, String projectId, String issueId,
                                               String title, String description, String userId, String displayName) {
        return new EmbeddingEvent(
            tenantId, projectId, "issue.created",
            new Actor(userId != null ? userId : "system", displayName != null ? displayName : "System"),
            new Resource("issue", issueId),
            Map.of("title", title != null ? title : "", "description", description != null ? description : "")
        );
    }

    /** Factory: issue updated (only when title/description changed) */
    public static EmbeddingEvent issueUpdated(String tenantId, String projectId, String issueId,
                                               String title, String description, String userId, String displayName) {
        return new EmbeddingEvent(
            tenantId, projectId, "issue.updated",
            new Actor(userId != null ? userId : "system", displayName != null ? displayName : "System"),
            new Resource("issue", issueId),
            Map.of("title", title != null ? title : "", "description", description != null ? description : "")
        );
    }

    /** Factory: comment created */
    public static EmbeddingEvent commentCreated(String tenantId, String projectId, String commentId,
                                                 String body) {
        return new EmbeddingEvent(
            tenantId, projectId, "comment.created",
            new Actor("system", "System"),
            new Resource("comment", commentId),
            Map.of("body", body != null ? body : "")
        );
    }

    /** Factory: project created or updated */
    public static EmbeddingEvent projectChanged(String tenantId, String projectId, String name, String description, boolean isNew) {
        return new EmbeddingEvent(
            tenantId, projectId, isNew ? "project.created" : "project.updated",
            new Actor("system", "System"),
            new Resource("project", projectId),
            Map.of("name", name != null ? name : "", "description", description != null ? description : "")
        );
    }

    /** Factory: wiki page created */
    public static EmbeddingEvent wikiPageCreated(String tenantId, String projectId, String pageId,
                                                  String title, String content) {
        return new EmbeddingEvent(
            tenantId, projectId, "wiki.created",
            new Actor("system", "System"),
            new Resource("knowledge_page", pageId),
            Map.of("title", title != null ? title : "", "content", content != null ? content : "")
        );
    }

    /** Factory: wiki page updated */
    public static EmbeddingEvent wikiPageUpdated(String tenantId, String projectId, String pageId,
                                                  String title, String content) {
        return new EmbeddingEvent(
            tenantId, projectId, "wiki.updated",
            new Actor("system", "System"),
            new Resource("knowledge_page", pageId),
            Map.of("title", title != null ? title : "", "content", content != null ? content : "")
        );
    }
}
