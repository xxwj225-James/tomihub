package com.ai_pm.core.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Dedicated @Primary TaskExecutor so @Async is unambiguous.
 * Without this, WebSocket STOMP's internal executors (clientInboundChannelExecutor, etc.)
 * confuse Spring's @Async proxy into picking the wrong executor.
 */
@Configuration
public class AsyncConfig {

    @Bean
    @Primary
    public TaskExecutor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("async-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        return executor;
    }

    @Bean
    public TransactionTemplate transactionTemplate(PlatformTransactionManager txManager) {
        TransactionTemplate tt = new TransactionTemplate(txManager);
        // REQUIRES_NEW: always start a fresh transaction, even if caller's tx is aborted.
        // Needed for idempotency recovery in NotificationService.createOrReuse().
        tt.setPropagationBehavior(TransactionTemplate.PROPAGATION_REQUIRES_NEW);
        return tt;
    }
}
