package com.ai_pm.core.config;

import com.ai_pm.common.crypto.CryptoUtils;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.util.HashMap;
import java.util.Map;

/**
 * Builds a routing DataSource that switches between the default (shared) database
 * and per-tenant PostgreSQL instances configured in tenant_db_config.
 * <p>
 * On startup, loads all tenant DB configs where host is non-empty, decrypts passwords,
 * and creates HikariCP pools. Queries are routed by TenantDataSourceRouter based on
 * {@code TenantContextHolder.getTenantId()}.
 */
@Slf4j
@Configuration
public class DataSourceConfig {

    private final DataSourceProperties properties;
    private final JdbcTemplate jdbc;

    public DataSourceConfig(DataSourceProperties properties, @Lazy JdbcTemplate jdbc) {
        this.properties = properties;
        this.jdbc = jdbc;
    }

    @Bean
    @Primary
    public DataSource dataSource() {
        // Step 1: Build the default DataSource from application.yml
        HikariDataSource defaultDs = properties.initializeDataSourceBuilder()
            .type(HikariDataSource.class)
            .build();

        // Step 2: Build tenant-specific DataSources from tenant_db_config table
        Map<Object, Object> targetDataSources = new HashMap<>();
        try {
            var configs = jdbc.queryForList(
                "SELECT tenant_id, host, port, database_name, username, password FROM tenant_db_config WHERE host IS NOT NULL AND host != ''");
            for (Map<String, Object> row : configs) {
                String tenantId = (String) row.get("tenant_id");
                String host = (String) row.get("host");
                Integer port = (Integer) row.get("port");
                String dbName = (String) row.get("database_name");
                String username = (String) row.get("username");
                String encryptedPassword = (String) row.get("password");

                if (host == null || dbName == null || username == null) continue;

                String password = CryptoUtils.decrypt(encryptedPassword != null ? encryptedPassword : "");

                HikariConfig hc = new HikariConfig();
                hc.setJdbcUrl("jdbc:postgresql://" + host + ":" + (port != null ? port : 5432) + "/" + dbName);
                hc.setUsername(username);
                hc.setPassword(password);
                hc.setDriverClassName("org.postgresql.Driver");
                hc.setMaximumPoolSize(10);
                hc.setMinimumIdle(2);
                hc.setConnectionTimeout(10000);
                hc.setMaxLifetime(1800000);
                hc.setIdleTimeout(600000);
                hc.setPoolName("tenant-" + tenantId.substring(0, 8));

                try {
                    HikariDataSource tenantDs = new HikariDataSource(hc);
                    targetDataSources.put(tenantId, tenantDs);
                    log.info("Tenant DataSource registered: {} → {}:{}/{}", tenantId, host, port, dbName);
                } catch (Exception e) {
                    log.error("Failed to create DataSource for tenant {}: {}", tenantId, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Could not load tenant DB configs (table may not exist yet): {}", e.getMessage());
        }

        // Step 3: Build the routing DataSource (always set targetDataSources — required by AbstractRoutingDataSource)
        if (targetDataSources.isEmpty()) {
            targetDataSources.put("__default__", defaultDs);
        }
        TenantDataSourceRouter router = new TenantDataSourceRouter();
        router.setDefaultTargetDataSource(defaultDs);
        router.setTargetDataSources(targetDataSources);
        router.afterPropertiesSet();
        return router;
    }
}
