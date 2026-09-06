package com.ai_pm.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tenant-specific SMTP configuration.
 *
 * Supports all standard SMTP providers:
 *   Microsoft 365   smtp.office365.com:587    STARTTLS
 *   Google Workspace smtp.gmail.com:587        STARTTLS (app password)
 *   Tencent Exmail  smtp.exmail.qq.com:587     STARTTLS
 *   NetEase Exmail  smtp.ym.163.com:587        STARTTLS
 *   Alibaba Mail    smtp.mxhichina.com:587     STARTTLS
 *   Custom          any SMTP server
 *
 * Each tenant can configure their own SMTP.
 * Falls back to global spring.mail config if not set.
 */
@Slf4j
@Service
public class TenantSmtpService {

    private final Map<String, JavaMailSender> tenantSenders = new ConcurrentHashMap<>();
    private final JavaMailSender globalSender;

    public TenantSmtpService(JavaMailSender globalSender) {
        this.globalSender = globalSender;
    }

    /**
     * Common enterprise email presets for one-click setup.
     */
    public static final Map<String, SmtpPreset> PRESETS = Map.of(
        "microsoft365", new SmtpPreset("smtp.office365.com", 587, true, "Microsoft 365 / Exchange Online"),
        "google",       new SmtpPreset("smtp.gmail.com", 587, true, "Google Workspace (needs app password)"),
        "tencent",      new SmtpPreset("smtp.exmail.qq.com", 587, true, "Tencent Exmail"),
        "netease",      new SmtpPreset("smtp.ym.163.com", 587, true, "NetEase Exmail"),
        "alibaba",      new SmtpPreset("smtp.mxhichina.com", 587, true, "Alibaba Mail"),
        "custom",       new SmtpPreset("", 587, true, "Custom SMTP")
    );

    public JavaMailSender getSender(String tenantId) {
        return tenantSenders.getOrDefault(tenantId, globalSender);
    }

    public void configureTenant(String tenantId, String host, int port,
                                 String username, String password, boolean starttls) {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(host);
        sender.setPort(port);
        sender.setUsername(username);
        sender.setPassword(password);

        Properties props = sender.getJavaMailProperties();
        props.put("mail.smtp.auth", "true");
        if (starttls) {
            props.put("mail.smtp.starttls.enable", "true");
            props.put("mail.smtp.starttls.required", "true");
        } else if (port == 465) {
            props.put("mail.smtp.ssl.enable", "true");
        }
        props.put("mail.smtp.connectiontimeout", "5000");
        props.put("mail.smtp.timeout", "5000");
        props.put("mail.smtp.writetimeout", "5000");

        tenantSenders.put(tenantId, sender);
        log.info("SMTP configured for tenant {}: {}:{}", tenantId, host, port);
    }

    public void reloadGlobal(SmtpConfigService.SmtpConfig config) {
        if (config.host() == null || config.host().isBlank()) return;
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(config.host());
        sender.setPort(config.port());
        sender.setUsername(config.username());
        sender.setPassword(config.password());
        Properties props = sender.getJavaMailProperties();
        props.put("mail.smtp.auth", String.valueOf(config.username() != null && !config.username().isBlank()));
        if (config.starttls()) {
            props.put("mail.smtp.starttls.enable", "true");
        } else if (config.port() == 465) {
            props.put("mail.smtp.ssl.enable", "true");
        }
        props.put("mail.smtp.connectiontimeout", "5000");
        props.put("mail.smtp.timeout", "5000");
        props.put("mail.smtp.writetimeout", "5000");
        com.ai_pm.common.net.ProxySupport.applySmtp(props);
        tenantSenders.put("__global__", sender);
    }

    public void removeTenant(String tenantId) {
        tenantSenders.remove(tenantId);
    }

    public record SmtpPreset(String host, int port, boolean starttls, String description) {}
}
