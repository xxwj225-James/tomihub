package com.ai_pm.common;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.ComponentScan;

/**
 * Auto-configuration entry point for ai-pm-common.
 * Scans shared beans: TenantContextHolder, UUIDv7 generator,
 * MyBatis-Plus config, structured logging, etc.
 */
@AutoConfiguration
@ComponentScan(basePackages = "com.ai_pm.common")
public class CommonAutoConfiguration {
}
