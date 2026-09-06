package com.ai_pm.core.event;

import com.ai_pm.core.config.RabbitConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.UUID;

/**
 * Listens for EmbeddingEvent (Spring in-process), converts to RabbitMQ message.
 * Fires AFTER transaction commit (guarantees DB write succeeded).
 * @Async ensures HTTP response is not blocked by RabbitMQ publish.
 *
 * Message routing key: project.{resourceType}.{action}.{projectId}
 *   e.g. project.issue.created.a1b2c3d4...
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmbeddingEventListener {

    private final RabbitTemplate rabbitTemplate;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onEmbeddingEvent(EmbeddingEvent event) {
        try {
            String routingKey = "project." + event.resource().type()
                + "." + event.eventType().substring(event.eventType().indexOf('.') + 1)
                + "." + event.projectId();
            rabbitTemplate.convertAndSend(
                RabbitConfig.EXCHANGE,
                routingKey,
                event,
                msg -> {
                    MessageProperties props = msg.getMessageProperties();
                    props.setMessageId(UUID.randomUUID().toString());
                    props.setContentType(MessageProperties.CONTENT_TYPE_JSON);
                    props.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                    return msg;
                }
            );
            log.debug("Published embedding event: {} routingKey={}", event.eventType(), routingKey);
        } catch (Exception e) {
            // Never let RabbitMQ errors impact the HTTP response
            log.error("Failed to publish embedding event for {} {}: {}",
                event.resource().type(), event.resource().id(), e.getMessage());
        }
    }
}
