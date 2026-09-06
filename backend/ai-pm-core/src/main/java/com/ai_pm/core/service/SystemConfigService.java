package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.core.entity.SystemConfig;
import com.ai_pm.core.repository.SystemConfigRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SystemConfigService {

    private final SystemConfigRepository configRepo;

    // AES-128 key (16 bytes) — production: use env variable or vault
    // Fixed 2026-08-20: "TomiHub-2026!@" was 14 bytes → cipher.init threw →
    // values stored plaintext. 16-byte key makes encryption effective.
    private static final byte[] ENC_KEY = "TomiHub-AES-2026".getBytes(StandardCharsets.UTF_8);

    private static final Set<String> ENCRYPTED_KEYS = Set.of(
        "llm.cloud_api_key", "llm.api_key"
    );

    private String encrypt(String plain) {
        if (plain == null || plain.isEmpty()) return plain;
        try {
            SecretKeySpec key = new SecretKeySpec(ENC_KEY, "AES");
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            return Base64.getEncoder().encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            log.warn("Encryption failed, storing as plaintext: {}", e.getMessage());
            return plain;
        }
    }

    private String decrypt(String encoded) {
        if (encoded == null || encoded.isEmpty()) return encoded;
        try {
            SecretKeySpec key = new SecretKeySpec(ENC_KEY, "AES");
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, key);
            return new String(cipher.doFinal(Base64.getDecoder().decode(encoded)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            // If decryption fails, it might be old plaintext — return as-is
            return encoded;
        }
    }

    @Transactional(readOnly = true)
    public Map<String, String> listByTenant() {
        String tenantId = TenantContextHolder.getTenantId();
        Map<String, String> result = new LinkedHashMap<>();
        for (SystemConfig c : configRepo.findByTenant(tenantId)) {
            String value = c.getValue();
            if (ENCRYPTED_KEYS.contains(c.getKey())) {
                value = decrypt(value);
            }
            result.put(c.getKey(), value);
        }
        return result;
    }

    @Transactional
    public void saveAll(Map<String, String> configs) {
        String tenantId = TenantContextHolder.getTenantId();
        for (var entry : configs.entrySet()) {
            String value = entry.getValue();
            if (ENCRYPTED_KEYS.contains(entry.getKey())) {
                value = encrypt(value);
            }
            var existing = configRepo.findByTenantAndKey(tenantId, entry.getKey());
            if (existing.isPresent()) {
                SystemConfig c = existing.get();
                c.setValue(value);
                configRepo.updateById(c);
            } else {
                SystemConfig c = new SystemConfig();
                c.setTenantId(tenantId);
                c.setKey(entry.getKey());
                c.setValue(value);
                configRepo.insert(c);
            }
        }
        log.info("System configs updated: {} keys", configs.size());
    }
}
