package com.ai_pm.common.crypto;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Centralized AES-128 encryption utilities.
 * Used by both auth (password at-rest encryption) and core (SMTP config encryption).
 * <p>
 * Key: 16-byte AES-128 key — NEVER change without migrating existing encrypted data.
 */
public final class CryptoUtils {

    // ⚠️  16 bytes for AES-128 — DO NOT CHANGE LENGTH
    // Fixed 2026-08-20: previous key "TomiHub-2026!@" was 14 bytes → cipher.init
    // threw InvalidKeyException → encrypt() fell back to plaintext (encryption
    // silently never worked). 16-byte key makes AES-128 actually effective.
    private static final byte[] ENC_KEY = "TomiHub-AES-2026".getBytes(StandardCharsets.UTF_8);

    /** Marker prefix for encrypted values — used to distinguish from legacy plaintext. */
    public static final String ENCRYPTED_PREFIX = "{aes}";

    private CryptoUtils() {}

    /**
     * AES-128-ECB encrypt, Base64-encode, prepend marker.
     * @return "{aes}base64string" or original plain if null/empty/error
     */
    public static String encrypt(String plain) {
        if (plain == null || plain.isEmpty()) return plain;
        try {
            var key = new SecretKeySpec(ENC_KEY, "AES");
            var cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return ENCRYPTED_PREFIX + Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            // If encryption fails, return plaintext — better than losing data
            return plain;
        }
    }

    /**
     * Decrypt a value that may or may not have the {@code {aes}} prefix.
     * <ul>
     *   <li>If prefixed with {@code {aes}} — strip prefix, Base64-decode, AES-decrypt</li>
     *   <li>If not prefixed — return as-is (legacy plaintext / BCrypt hash)</li>
     *   <li>If decryption fails — return as-is (corrupted or legacy format)</li>
     * </ul>
     */
    public static String decrypt(String encoded) {
        if (encoded == null || encoded.isEmpty()) return encoded;
        if (!encoded.startsWith(ENCRYPTED_PREFIX)) {
            return encoded; // legacy plaintext
        }
        String base64 = encoded.substring(ENCRYPTED_PREFIX.length());
        try {
            var key = new SecretKeySpec(ENC_KEY, "AES");
            var cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, key);
            byte[] decrypted = cipher.doFinal(Base64.getDecoder().decode(base64));
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            // Decryption failed — likely legacy plaintext or corrupted data
            return encoded;
        }
    }

    /**
     * Check if a value is encrypted (has the {@code {aes}} prefix).
     */
    public static boolean isEncrypted(String value) {
        return value != null && value.startsWith(ENCRYPTED_PREFIX);
    }
}
