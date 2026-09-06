package com.ai_pm.core;

import lombok.extern.slf4j.Slf4j;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import jakarta.annotation.PreDestroy;

import org.springframework.amqp.rabbit.annotation.EnableRabbit;

@Slf4j
@EnableAsync
@EnableScheduling
@EnableRabbit
@SpringBootApplication
@ComponentScan({"com.ai_pm.core", "com.ai_pm.common"})
@MapperScan({"com.ai_pm.core.repository", "com.ai_pm.common.repository"})
public class CoreApplication {

    public static void main(String[] args) {
        Runtime.getRuntime().addShutdownHook(new Thread(() ->
            log.info("CoreApplication shutting down via JVM shutdown hook")
        ));
        log.info("CoreApplication starting...");
        SpringApplication.run(CoreApplication.class, args);
        log.info("CoreApplication started on port 8082");
    }

    @PreDestroy
    public void onShutdown() {
        log.info("CoreApplication @PreDestroy — container shutting down");
    }
}
