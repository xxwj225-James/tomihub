package com.ai_pm.core.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Loads the JWT public key from system_configs.
 * Auth service generates and stores the RSA key pair on first run.
 * Core only needs the public key for token verification.
 *
 * On first deployment, Auth may generate keys after Core starts.
 * This provider retries with backoff until the key is available.
 */
@Slf4j
@Component
public class JwtPublicKeyProvider {

    private final JdbcTemplate jdbc;
    private volatile String publicKey;

    public JwtPublicKeyProvider(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void init() {
        loadKey();
    }

    private void loadKey() {
        // When JWT keys are configured via env (JWT_PUBLIC_KEY), auth uses them
        // directly and never writes them to system_configs — so prefer the env
        // value, which is guaranteed to match the key auth signs with.
        String envKey = System.getenv("JWT_PUBLIC_KEY");
        if (envKey != null && !envKey.isBlank()) {
            this.publicKey = envKey;
            log.info("JWT public key loaded from environment (JWT_PUBLIC_KEY)");
            return;
        }
        int retries = 0;
        while (retries < 30) { // max 30s wait for Auth to generate keys
            try {
                this.publicKey = jdbc.queryForObject(
                    "SELECT value FROM system_configs WHERE key = 'jwt.public_key'", String.class);
                if (publicKey != null && !publicKey.isBlank()) {
                    log.info("JWT public key loaded from database");
                    return;
                }
            } catch (Exception e) {
                log.debug("JWT public key not yet available (retry {}/30)...", retries + 1);
            }
            retries++;
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
        }
        log.error("JWT public key still not available after {} retries", retries);
    }

    public String getPublicKey() {
        return publicKey;
    }
}
