package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.crypto.CryptoUtils;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.common.exception.PermissionDeniedException;
import com.ai_pm.common.repository.TenantMemberRepository;
import com.ai_pm.core.dto.DbConfigDto;
import com.ai_pm.core.entity.DbConfig;
import com.ai_pm.core.repository.DbConfigRepository;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class DbConfigService {

    private final DbConfigRepository dbConfigRepository;
    private final TenantMemberRepository tenantMemberRepository;
    private final javax.sql.DataSource dataSource;

    private void checkOwner() {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        var member = tenantMemberRepository.findByTenantIdAndUserId(tenantId, userId)
                .orElseThrow(() -> new PermissionDeniedException("Not a member of this tenant"));
        if (!"owner".equals(member.getRole())) {
            throw new PermissionDeniedException("Only tenant owner can perform this operation");
        }
    }

    @Transactional(readOnly = true)
    public DbConfig get() {
        String tenantId = TenantContextHolder.getTenantId();
        DbConfig cfg = dbConfigRepository.selectById(tenantId);
        if (cfg == null) {
            cfg = new DbConfig();
            cfg.setTenantId(tenantId);
            cfg.setHost("");
            cfg.setPort(5432);
            cfg.setDatabaseName("");
            cfg.setUsername("");
            cfg.setPassword("");
            cfg.setServiceStatus("stopped");
        }
        // Mask password — never return actual password to client
        cfg.setPassword("");
        return cfg;
    }

    @Transactional
    public void save(DbConfigDto dto) {
        checkOwner();
        String tenantId = TenantContextHolder.getTenantId();

        DbConfig cfg = dbConfigRepository.selectById(tenantId);
        if (cfg == null) {
            cfg = new DbConfig();
            cfg.setTenantId(tenantId);
        }
        cfg.setHost(dto.host());
        cfg.setPort(dto.port());
        cfg.setDatabaseName(dto.databaseName());
        cfg.setUsername(dto.username());

        // Encrypt password before storing
        String password = dto.password();
        if (password != null && !password.isEmpty()) {
            cfg.setPassword(CryptoUtils.encrypt(password));
        }
        cfg.setServiceStatus("stopped");

        if (dbConfigRepository.selectById(tenantId) != null) {
            dbConfigRepository.updateById(cfg);
        } else {
            dbConfigRepository.insert(cfg);
        }
        log.info("DbConfig saved for tenant={}", tenantId);
        // Try to register new tenant DataSource in router (hot-add without restart)
        if (dto.host() != null && !dto.host().isEmpty()) {
            tryRegisterTenantDataSource(tenantId, dto.host(), dto.port(), dto.databaseName(), dto.username(), password);
        }
    }

    @Transactional(readOnly = true)
    public String testConnection(DbConfigDto dto) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:postgresql://" + dto.host() + ":" + dto.port() + "/" + dto.databaseName());
        config.setUsername(dto.username());
        config.setPassword(dto.password());
        config.setConnectionTimeout(5000);
        config.setMaximumPoolSize(1);

        try (HikariDataSource ds = new HikariDataSource(config);
             Connection conn = ds.getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute("SELECT 1");
            return "Connection successful";
        } catch (Exception e) {
            log.warn("DbConfig test connection failed: {}", e.getMessage());
            throw new BusinessException(500, "Connection failed: " + e.getMessage());
        }
    }

    @Transactional
    public void stopService() {
        checkOwner();
        runDockerCommand("docker", "compose", "stop", "core");
        updateServiceStatus("stopped");
        log.info("DbConfig service stopped for tenant={}", TenantContextHolder.getTenantId());
    }

    @Transactional
    public void restartService() {
        checkOwner();
        runDockerCommand("docker", "compose", "up", "-d", "--force-recreate", "core");
        updateServiceStatus("running");
        log.info("DbConfig service restarted for tenant={}", TenantContextHolder.getTenantId());
    }

    @Transactional(readOnly = true)
    public String getStatus() {
        String tenantId = TenantContextHolder.getTenantId();
        DbConfig cfg = dbConfigRepository.selectById(tenantId);
        return cfg != null ? cfg.getServiceStatus() : "stopped";
    }

    private void updateServiceStatus(String status) {
        String tenantId = TenantContextHolder.getTenantId();
        DbConfig cfg = dbConfigRepository.selectById(tenantId);
        if (cfg != null) {
            cfg.setServiceStatus(status);
            dbConfigRepository.updateById(cfg);
        }
    }

    private void tryRegisterTenantDataSource(String tenantId, String host, int port, String dbName, String username, String password) {
        try {
            var router = (com.ai_pm.core.config.TenantDataSourceRouter) dataSource;
            var resolved = router.getResolvedDataSources();
            if (resolved != null && resolved.containsKey(tenantId)) {
                // Close old pool before replacing
                var old = resolved.get(tenantId);
                if (old instanceof com.zaxxer.hikari.HikariDataSource hds) {
                    hds.close();
                }
            }
            com.zaxxer.hikari.HikariConfig hc = new com.zaxxer.hikari.HikariConfig();
            hc.setJdbcUrl("jdbc:postgresql://" + host + ":" + port + "/" + dbName);
            hc.setUsername(username);
            hc.setPassword(password != null ? password : "");
            hc.setDriverClassName("org.postgresql.Driver");
            hc.setMaximumPoolSize(10);
            hc.setMinimumIdle(2);
            hc.setConnectionTimeout(10000);
            hc.setPoolName("tenant-" + tenantId.substring(0, 8));
            com.zaxxer.hikari.HikariDataSource tenantDs = new com.zaxxer.hikari.HikariDataSource(hc);
            router.addTargetDataSource(tenantId, tenantDs);
            log.info("Tenant DataSource hot-registered for tenant={}", tenantId);
        } catch (Exception e) {
            log.warn("Could not register tenant DataSource (will take effect after restart): {}", e.getMessage());
        }
    }

    private void runDockerCommand(String... args) {
        if (!Files.exists(Path.of("/var/run/docker.sock"))) {
            log.warn("Docker socket not available, skipping docker command");
            return;
        }
        try {
            ProcessBuilder pb = new ProcessBuilder(args);
            pb.directory(new File("/app"));
            pb.inheritIO();
            Process p = pb.start();
            if (!p.waitFor(30, TimeUnit.SECONDS) || p.exitValue() != 0) {
                throw new BusinessException(500, "Docker command failed");
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Docker command failed: {}", e.getMessage());
            throw new BusinessException(500, "Docker command failed: " + e.getMessage());
        }
    }
}
