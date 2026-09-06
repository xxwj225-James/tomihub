package com.ai_pm.auth.config;

import com.ai_pm.common.crypto.CryptoUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Password encoder that adds AES-128 encryption at rest on top of BCrypt hashing.
 *
 * <p><b>Storage format:</b>
 * <ul>
 *   <li>New passwords: {@code {aes}<Base64(AES-encrypted BCrypt hash)>}</li>
 *   <li>Legacy passwords (auto-detected): plain BCrypt hash {@code $2a$...}</li>
 * </ul>
 *
 * <p><b>Auto-migration:</b> On successful login with a legacy (unencrypted) hash,
 * the caller should call {@link #encode(CharSequence)} and persist the new encrypted
 * hash — see {@link com.ai_pm.auth.service.AuthService#login}.
 */
@Slf4j
public class EncryptedPasswordEncoder implements PasswordEncoder {

    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

    /**
     * BCrypt-hash the raw password, then AES-encrypt the hash for at-rest storage.
     * <p>
     * Result format: {@code {aes}<Base64(AES(BCrypt(raw)))>}
     */
    @Override
    public String encode(CharSequence rawPassword) {
        String bcryptHash = bcrypt.encode(rawPassword);
        return CryptoUtils.encrypt(bcryptHash);
    }

    /**
     * Verify a raw password against a stored hash.
     * <p>
     * Handles both encrypted ({@code {aes}...}) and legacy plain BCrypt hashes.
     */
    @Override
    public boolean matches(CharSequence rawPassword, String encodedPassword) {
        if (rawPassword == null || encodedPassword == null) {
            return false;
        }
        // Decrypt if encrypted; otherwise treat as legacy BCrypt hash
        String bcryptHash = CryptoUtils.decrypt(encodedPassword);
        return bcrypt.matches(rawPassword, bcryptHash);
    }

    /**
     * Check if the stored hash is in the legacy (unencrypted) format.
     * Callers can use this to trigger auto-migration on successful login.
     */
    public boolean isLegacyFormat(String encodedPassword) {
        return encodedPassword != null && !CryptoUtils.isEncrypted(encodedPassword);
    }

    /**
     * Expose the underlying BCrypt encoder for direct use if needed.
     */
    public BCryptPasswordEncoder bcrypt() {
        return bcrypt;
    }

    /**
     * Spring Security hook: returns true if the stored hash should be re-encoded.
     * Legacy (unencrypted) BCrypt hashes trigger auto-migration to AES-encrypted format.
     */
    @Override
    public boolean upgradeEncoding(String encodedPassword) {
        return isLegacyFormat(encodedPassword);
    }
}
