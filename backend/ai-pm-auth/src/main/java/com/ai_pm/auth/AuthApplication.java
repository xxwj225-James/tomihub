package com.ai_pm.auth;

import lombok.extern.slf4j.Slf4j;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

import jakarta.annotation.PreDestroy;

@Slf4j
@SpringBootApplication
@ComponentScan({"com.ai_pm.auth", "com.ai_pm.common"})
@MapperScan({"com.ai_pm.auth.repository", "com.ai_pm.common.repository"})
public class AuthApplication {

    public static void main(String[] args) {
        Runtime.getRuntime().addShutdownHook(new Thread(() ->
            log.info("AuthApplication shutting down via JVM shutdown hook")
        ));
        log.info("AuthApplication starting...");
        SpringApplication.run(AuthApplication.class, args);
        log.info("AuthApplication started on port 8081");
    }

    @PreDestroy
    public void onShutdown() {
        log.info("AuthApplication @PreDestroy — container shutting down");
    }
}
