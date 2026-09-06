package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.core.entity.LlmConfig;
import com.ai_pm.core.repository.LlmConfigRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class LlmConfigService {

    private final LlmConfigRepository configRepo;

    // 16-byte AES-128 key. Fixed 2026-08-20: "TomiHub-2026!@#" was 15 bytes →
    // cipher.init threw → encrypt() caught and stored plaintext. Must stay 16 bytes.
    private static final byte[] ENC_KEY = "TomiHub-AES-2026".getBytes(StandardCharsets.UTF_8);

    @Transactional
    public LlmConfig getOrCreate() {
        String tenantId = TenantContextHolder.getTenantId();
        LlmConfig cfg = configRepo.selectById(tenantId);
        if (cfg == null) {
            // Demo/viewer tenants reuse the most recent global config instead
            // of creating their own row — keeps llm_config single-row in practice.
            List<LlmConfig> latest = configRepo.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<LlmConfig>()
                    .orderByDesc("updated_at").last("LIMIT 1"));
            if (!latest.isEmpty()) {
                cfg = latest.get(0);
                cfg.setTenantId(tenantId);
                configRepo.insert(cfg);
            } else {
                cfg = new LlmConfig();
                cfg.setTenantId(tenantId);
                cfg.setBackend("ollama");
                cfg.setOllamaBaseUrl("http://ollama-embed:11434");
                cfg.setFlashTimeout(120);
                cfg.setProTimeout(300);
                configRepo.insert(cfg);
            }
        }
        // Decrypt API key for response
        if (cfg.getCloudApiKey() != null && !cfg.getCloudApiKey().isEmpty()) {
            cfg.setCloudApiKey(decrypt(cfg.getCloudApiKey()));
        }
        return cfg;
    }

    @Transactional
    public LlmConfig toggleService(boolean enabled) {
        LlmConfig cfg = getOrCreate();
        cfg.setServiceEnabled(enabled);
        configRepo.updateById(cfg);
        log.info("AI service {} by admin", enabled ? "enabled" : "disabled");
        return cfg;
    }

    @Transactional
    public LlmConfig save(LlmConfig input) {
        String tenantId = TenantContextHolder.getTenantId();
        input.setTenantId(tenantId);
        // Encrypt API key before storing — but only if it is NOT already
        // ciphertext. The GET path returns the decrypted (plaintext) key, yet a
        // stale client could echo back an already-encrypted value; re-encrypting
        // that would double-encrypt and break auth. Detection: ciphertext is
        // valid base64 whose AES-decrypt succeeds; plaintext usually isn't 60+
        // chars of base64 that decrypts cleanly.
        if (input.getCloudApiKey() != null && !input.getCloudApiKey().isEmpty()
                && !isEncrypted(input.getCloudApiKey())) {
            input.setCloudApiKey(encrypt(input.getCloudApiKey()));
        }
        LlmConfig existing = configRepo.selectById(tenantId);
        if (existing != null) {
            configRepo.updateById(input);
        } else {
            configRepo.insert(input);
        }
        log.info("LLM config saved: backend={}", input.getBackend());
        // Return decrypted (never double-encrypt on repeated GET-after-save)
        if (input.getCloudApiKey() != null && !input.getCloudApiKey().isEmpty()) {
            input.setCloudApiKey(decrypt(input.getCloudApiKey()));
        }
        return input;
    }

    /** True if the value looks like our AES-ECB ciphertext (decrypts cleanly). */
    private boolean isEncrypted(String value) {
        try {
            SecretKeySpec key = new SecretKeySpec(ENC_KEY, "AES");
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, key);
            byte[] out = cipher.doFinal(Base64.getDecoder().decode(value));
            return out != null && out.length > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private String encrypt(String plain) {
        try {
            SecretKeySpec key = new SecretKeySpec(ENC_KEY, "AES");
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            return Base64.getEncoder().encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { return plain; }
    }

    private String decrypt(String encoded) {
        try {
            SecretKeySpec key = new SecretKeySpec(ENC_KEY, "AES");
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, key);
            return new String(cipher.doFinal(Base64.getDecoder().decode(encoded)), StandardCharsets.UTF_8);
        } catch (Exception e) { return encoded; }
    }
}
