package com.ai_pm.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import lombok.extern.slf4j.Slf4j;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * Minimal JWT validator — verifies RS256 signature and extracts claims.
 * Shared between auth and core services.
 * In production, the API Gateway does this; backend services receive pre-validated headers.
 */
@Slf4j
public class JwtValidator {

    private final PublicKey publicKey;

    public JwtValidator(String publicKeyBase64) {
        try {
            byte[] keyBytes = Base64.getDecoder().decode(publicKeyBase64
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", ""));
            X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
            this.publicKey = KeyFactory.getInstance("RSA").generatePublic(spec);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load JWT public key", e);
        }
    }

    public Claims validate(String token) {
        return Jwts.parser()
            .verifyWith(publicKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}
