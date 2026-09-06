package com.ai_pm.auth.service;

import com.ai_pm.auth.repository.SystemConfigRepository;
import com.ai_pm.common.crypto.CryptoUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SmtpConfigService {

    private final SystemConfigRepository configRepo;
    private final TenantSmtpService smtpService;

    private static final String PASSWORD_KEY = "smtp.password";

    public static final Map<String, SmtpPreset> PRESETS = new LinkedHashMap<>() {{
        put("microsoft365", new SmtpPreset("smtp.office365.com", 587, true, "Microsoft 365 / Exchange Online"));
        put("google",       new SmtpPreset("smtp.gmail.com", 587, true, "Google Workspace (App Password)"));
        put("tencent",      new SmtpPreset("smtp.exmail.qq.com", 587, true, "Tencent Exmail"));
        put("netease",      new SmtpPreset("smtp.ym.163.com", 587, true, "NetEase Exmail"));
        put("alibaba",      new SmtpPreset("smtp.mxhichina.com", 587, true, "Alibaba Mail"));
        put("custom",       new SmtpPreset("", 587, true, "Custom SMTP"));
    }};

    @Transactional(readOnly = true)
    public SmtpConfig getConfig() {
        Map<String, String> all = new LinkedHashMap<>();
        for (var row : configRepo.findAll()) {
            all.put(row.get("key"), row.get("value"));
        }
        return new SmtpConfig(
            get(all, "smtp.host"),
            Integer.parseInt(get(all, "smtp.port")),
            get(all, "smtp.username"),
            CryptoUtils.decrypt(get(all, PASSWORD_KEY)),
            Boolean.parseBoolean(get(all, "smtp.starttls")),
            get(all, "smtp.from_name")
        );
    }

    @Transactional
    public SmtpConfig updateConfig(SmtpConfig config, String userId) {
        upsert("smtp.host", config.host(), userId);
        upsert("smtp.port", String.valueOf(config.port()), userId);
        upsert("smtp.username", config.username(), userId);
        upsert(PASSWORD_KEY, CryptoUtils.encrypt(config.password()), userId);
        upsert("smtp.starttls", String.valueOf(config.starttls()), userId);
        upsert("smtp.from_name", config.fromName(), userId);

        // Hot-reload: re-register SMTP sender
        smtpService.reloadGlobal(config);
        log.info("SMTP config updated by user {}", userId);
        return getConfig();
    }

    private void upsert(String key, String value, String userId) {
        configRepo.upsert(key, value != null ? value : "", userId);
    }

    private String get(Map<String, String> map, String key) {
        return map.getOrDefault(key, "");
    }

    public record SmtpConfig(String host, int port, String username,
                              String password, boolean starttls, String fromName) {}

    @Transactional(readOnly = true)
    public boolean testConnection(SmtpConfig config) {
        try {
            smtpService.reloadGlobal(config);
            var sender = smtpService.getSender("__global__");
            if (sender instanceof org.springframework.mail.javamail.JavaMailSenderImpl impl) {
                impl.testConnection();
            }
            return true;
        } catch (Exception e) {
            log.warn("SMTP test connection failed: {}", e.getMessage());
            return false;
        }
    }

    public record SmtpPreset(String host, int port, boolean starttls, String description) {}
}
