package com.ai_pm.core.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * RabbitMQ configuration for publishing embedding events.
 * Exchange: ai-pm.events (topic, durable — Python consumer binds to this).
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class RabbitConfig {

    public static final String EXCHANGE = "ai-pm.events";

    @Bean
    public TopicExchange embeddingEventsExchange() {
        return new TopicExchange(EXCHANGE, true, false);  // durable, non-auto-delete
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter(new ObjectMapper());
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory,
                                          MessageConverter jsonMessageConverter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(jsonMessageConverter);
        template.setMandatory(true);  // Required for returns callback to fire

        // Publisher confirms — log failures (don't block the caller)
        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (!ack && correlationData != null) {
                log.warn("RabbitMQ publish failed for {}: {}",
                    correlationData.getId(), cause != null ? cause : "unknown");
            }
        });

        // Return callback — handle unroutable messages
        template.setReturnsCallback(returned -> {
            log.warn("RabbitMQ message returned (unroutable): exchange={}, routingKey={}, replyCode={}",
                returned.getExchange(), returned.getRoutingKey(), returned.getReplyCode());
        });

        return template;
    }
}
