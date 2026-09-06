package com.ai_pm.auth.service;

import com.ai_pm.auth.config.JwtProperties;
import com.ai_pm.common.crypto.CryptoUtils;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

/**
 * JWT RS256 (asymmetric) token provider.
 *
 * Key management:
 *   1. If jwt.private-key is configured → use it (env / application.yml)
 *   2. If NOT configured → read from DB (system_configs.jwt.private_key / jwt.public_key)
 *   3. If NOT in DB → auto-generate RSA key pair, encrypt private key, store both in DB
 *
 * Two token scopes:
 *   tenant_selection  → only /auth/select-tenant (after login, before choosing workspace)
 *   business          → all business APIs (after selecting workspace)
 */
@Slf4j
@Component
public class JwtTokenProvider {

    private final JwtProperties props;
    private final JdbcTemplate jdbc;
    private PrivateKey privateKey;
    private PublicKey publicKey;

    public JwtTokenProvider(JwtProperties props, JdbcTemplate jdbc) {
        this.props = props;
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void init() throws Exception {
        if (props.getPrivateKey() != null && !props.getPrivateKey().isBlank()) {
            // Mode 1: Keys configured in properties (env / application.yml)
            this.privateKey = parsePrivateKey(props.getPrivateKey());
            this.publicKey = parsePublicKey(props.getPublicKey());
            log.info("JWT keys loaded from configuration");
        } else {
            // Mode 2+3: Try DB first, otherwise generate and store
            loadOrGenerateKeys();
        }
    }

    /**
     * Try to load keys from system_configs. If not found, generate and store.
     */
    private void loadOrGenerateKeys() throws Exception {
        try {
            String encryptedPriv = jdbc.queryForObject(
                "SELECT value FROM system_configs WHERE key = 'jwt.private_key'", String.class);
            String pubKey = jdbc.queryForObject(
                "SELECT value FROM system_configs WHERE key = 'jwt.public_key'", String.class);

            if (encryptedPriv != null && pubKey != null) {
                // Mode 2: Load from DB
                String privateKeyPem = CryptoUtils.decrypt(encryptedPriv);
                this.privateKey = parsePrivateKey(privateKeyPem);
                this.publicKey = parsePublicKey(pubKey);
                log.info("JWT keys loaded from database");
                return;
            }
        } catch (EmptyResultDataAccessException e) {
            // Keys not in DB — generate
        }

        // Mode 3: Auto-generate and persist
        log.info("No JWT keys found — generating RSA key pair and storing in database");
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        var pair = gen.generateKeyPair();
        this.privateKey = pair.getPrivate();
        this.publicKey = pair.getPublic();

        // Encode to PEM
        String privateKeyPem = "-----BEGIN PRIVATE KEY-----\n"
            + Base64.getEncoder().encodeToString(privateKey.getEncoded())
            + "\n-----END PRIVATE KEY-----\n";
        String publicKeyPem = "-----BEGIN PUBLIC KEY-----\n"
            + Base64.getEncoder().encodeToString(publicKey.getEncoded())
            + "\n-----END PUBLIC KEY-----\n";

        // Encrypt private key before storing in DB
        String encryptedPriv = CryptoUtils.encrypt(privateKeyPem);

        jdbc.update(
            "INSERT INTO system_configs (id, key, value) VALUES (gen_random_uuid(), 'jwt.private_key', ?) ON CONFLICT (key) DO UPDATE SET value = ?",
            encryptedPriv, encryptedPriv);
        jdbc.update(
            "INSERT INTO system_configs (id, key, value) VALUES (gen_random_uuid(), 'jwt.public_key', ?) ON CONFLICT (key) DO UPDATE SET value = ?",
            publicKeyPem, publicKeyPem);

        log.info("JWT keys generated, encrypted, and stored in database");
    }

    // ═══ Token Generation ═══

    /**
     * Generate an Access Token.
     *
     * @param scope  "tenant_selection" or "business"
     */
    public String generateAccessToken(String userId, String email,
                                       String tenantId, String scope,
                                       Duration ttl) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
            .issuer(props.getIssuer())
            .subject(userId)
            .claim("email", email)
            .claim("scope", scope)             // ★ tenant_selection | business
            .claim("type", "access")
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(ttl)))
            .id(UUID.randomUUID().toString());

        if (tenantId != null) {
            builder.claim("tenant_id", tenantId);
        }

        return builder.signWith(privateKey).compact();
    }

    /**
     * Generate a Refresh Token.
     */
    public String generateRefreshToken(String userId, String tenantId, Duration ttl) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
            .issuer(props.getIssuer())
            .subject(userId)
            .claim("type", "refresh")
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(ttl)))
            .id(UUID.randomUUID().toString());

        if (tenantId != null) {
            builder.claim("tenant_id", tenantId);
        }

        return builder.signWith(privateKey).compact();
    }

    // ═══ Token Validation ═══

    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Token validation failed: {}", e.getMessage());
            return false;
        }
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
            .verifyWith(publicKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    // ═══ Claim Extraction ═══

    public String getUserId(String token) {
        return parseClaims(token).getSubject();
    }

    public String getTenantId(String token) {
        return parseClaims(token).get("tenant_id", String.class);
    }

    public String getScope(String token) {
        return parseClaims(token).get("scope", String.class);
    }

    public String getEmail(String token) {
        return parseClaims(token).get("email", String.class);
    }

    public String getJti(String token) {
        return parseClaims(token).getId();
    }

    // ═══ Key Parsing ═══

    private PrivateKey parsePrivateKey(String key) throws Exception {
        String pem = key.replace("-----BEGIN PRIVATE KEY-----", "")
                        .replace("-----END PRIVATE KEY-----", "")
                        .replaceAll("\\s", "");
        byte[] decoded = Base64.getDecoder().decode(pem);
        return KeyFactory.getInstance("RSA")
            .generatePrivate(new PKCS8EncodedKeySpec(decoded));
    }

    private PublicKey parsePublicKey(String key) throws Exception {
        String pem = key.replace("-----BEGIN PUBLIC KEY-----", "")
                        .replace("-----END PUBLIC KEY-----", "")
                        .replaceAll("\\s", "");
        byte[] decoded = Base64.getDecoder().decode(pem);
        return KeyFactory.getInstance("RSA")
            .generatePublic(new X509EncodedKeySpec(decoded));
    }
}
