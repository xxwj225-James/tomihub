package com.ai_pm.common.mail;

import com.ai_pm.common.crypto.CryptoUtils;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/**
 * Shared SMTP sender — reads config from system_configs (key-value store).
 * Used by both auth (invite/verification emails) and core (report sharing emails).
 *
 * Usage:
 *   mailSender.send(to, subject, htmlBody);
 *   mailSender.send(to, cc, subject, htmlBody);
 */
@Slf4j
@Component
public class SmtpMailSender {

    private final JdbcTemplate jdbc;

    private static final String PASSWORD_KEY = "smtp.password";

    public SmtpMailSender(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** SMTP config snapshot. */
    public record SmtpConfig(String host, int port, String username,
                             String password, String fromName, boolean starttls) {}

    /** Read and decrypt SMTP config from system_configs. Returns null if not configured. */
    public SmtpConfig loadConfig() {
        try {
            var rows = jdbc.queryForList("SELECT key, value FROM system_configs WHERE key LIKE 'smtp.%'");
            var map = new java.util.HashMap<String, String>();
            for (var row : rows) {
                map.put((String) row.get("key"), (String) row.get("value"));
            }
            var host = map.getOrDefault("smtp.host", "");
            if (host.isBlank()) return null;
            var port = Integer.parseInt(map.getOrDefault("smtp.port", "587"));
            var username = map.getOrDefault("smtp.username", "");
            var password = CryptoUtils.decrypt(map.getOrDefault(PASSWORD_KEY, ""));
            var fromName = map.getOrDefault("smtp.from_name", "");
            var starttls = Boolean.parseBoolean(map.getOrDefault("smtp.starttls", "true"));
            return new SmtpConfig(host, port, username, password, fromName, starttls);
        } catch (Exception e) {
            log.warn("Failed to load SMTP config: {}", e.getMessage());
            return null;
        }
    }

    public String getFromAddress() {
        var cfg = loadConfig();
        if (cfg != null && cfg.username != null && !cfg.username.isBlank()) return cfg.username;
        return "noreply@tomi-hub.ai";
    }

    public String getFromDisplayName() {
        var cfg = loadConfig();
        if (cfg != null && cfg.fromName != null && !cfg.fromName.isBlank()) return cfg.fromName;
        return "";
    }

    /** Send a simple HTML email. */
    public void send(String to, String subject, String html) throws MessagingException {
        send(to, null, subject, html);
    }

    /** Send with CC. */
    public void send(String to, String cc, String subject, String html) throws MessagingException {
        var cfg = loadConfig();
        if (cfg == null || cfg.host.isBlank()) {
            log.warn("SMTP not configured — cannot send email to {}", to);
            throw new MessagingException("SMTP not configured. Please set up SMTP in Admin Settings.");
        }
        var sender = new JavaMailSenderImpl();
        sender.setHost(cfg.host);
        sender.setPort(cfg.port);
        sender.setUsername(cfg.username);
        sender.setPassword(cfg.password);
        var props = sender.getJavaMailProperties();
        props.put("mail.smtp.auth", String.valueOf(cfg.username != null && !cfg.username.isBlank()));
        if (cfg.starttls) {
            props.put("mail.smtp.starttls.enable", "true");
        } else if (cfg.port == 465) {
            props.put("mail.smtp.ssl.enable", "true");
        }
        props.put("mail.smtp.connectiontimeout", "5000");
        props.put("mail.smtp.timeout", "10000");
        props.put("mail.smtp.writetimeout", "10000");
        com.ai_pm.common.net.ProxySupport.applySmtp(props);

        var msg = sender.createMimeMessage();
        var helper = new MimeMessageHelper(msg, true, "UTF-8");
        try {
            if (cfg.fromName != null && !cfg.fromName.isBlank())
                helper.setFrom(cfg.username, cfg.fromName);
            else helper.setFrom(cfg.username);
        } catch (java.io.UnsupportedEncodingException e) {
            helper.setFrom(cfg.username);
        }
        helper.setTo(to);
        if (cc != null && !cc.isBlank()) helper.setCc(cc.split(",\\s*"));
        helper.setSubject(subject);
        helper.setText(html, true);
        sender.send(msg);
        log.info("Email sent to {} via {}", to, cfg.host);
    }

    /** Quick SMTP connectivity check. */
    public boolean testConnection() {
        try {
            var cfg = loadConfig();
            if (cfg == null || cfg.host.isBlank()) return false;
            var sender = new JavaMailSenderImpl();
            sender.setHost(cfg.host);
            sender.setPort(cfg.port);
            sender.setUsername(cfg.username);
            sender.setPassword(cfg.password);
            sender.getJavaMailProperties().put("mail.smtp.auth", "true");
            if (cfg.port == 465) sender.getJavaMailProperties().put("mail.smtp.ssl.enable", "true");
            sender.testConnection();
            return true;
        } catch (Exception e) {
            log.warn("SMTP test connection failed: {}", e.getMessage());
            return false;
        }
    }

}
