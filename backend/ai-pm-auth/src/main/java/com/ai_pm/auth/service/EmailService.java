package com.ai_pm.auth.service;

import com.ai_pm.common.mail.SmtpMailSender;
import jakarta.mail.MessagingException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Business-layer email service — builds HTML templates, delegates sending to common SmtpMailSender.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final SmtpMailSender mailSender;

    @org.springframework.beans.factory.annotation.Value("${app.base-url:http://localhost}")
    private String baseUrl;

    /** Send an invite email with registration link. Throws if SMTP fails — caller handles it. */
    public void sendInviteEmail(String to, String workspaceName, String role,
                                 String inviteCode, String linkBase) throws MessagingException {
        // Prefer the request-derived base (correct even when APP_BASE_URL unset);
        // fall back to the configured app.base-url.
        String base = (linkBase != null && !linkBase.isBlank()) ? linkBase : baseUrl;
        String link = base + "/join?code=" + inviteCode;
        String html = "<div style=\"max-width:480px;margin:0 auto;font-family:-apple-system,sans-serif\">"
            + "<div style=\"padding:24px 0;text-align:center\">"
            + "<h2 style=\"color:#4F46E5;margin:0\">TomiHub</h2></div>"
            + "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px 24px\">"
            + "<h3 style=\"margin:0 0 12px;color:#111827\">You have been invited!</h3>"
            + "<p style=\"color:#6b7280;font-size:14px;line-height:1.6\">"
            + "You have been invited to join <strong>" + workspaceName + "</strong>"
            + " as <strong>" + role + "</strong>.</p>"
            + "<div style=\"text-align:center;margin:24px 0\">"
            + "<a href=\"" + link + "\" style=\"display:inline-block;background:#4F46E5;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px\">"
            + "Accept Invitation</a></div>"
            + "<p style=\"color:#6b7280;font-size:12px;margin-top:16px\">"
            + "Or use this code: <span style=\"font-family:monospace;background:#f3f4f6;padding:2px 8px;border-radius:4px;font-weight:600\">" + inviteCode + "</span></p>"
            + "<p style=\"color:#9ca3af;font-size:12px\">"
            + "This invitation expires in 7 days.</p></div></div>";

        mailSender.send(to, "[TomiHub] You have been invited to " + workspaceName, html);
        log.info("Invite email sent to {}", to);
    }

    /** Send celebration email when invited user completes registration. */
    public void sendInviteAccepted(String to, String inviteeName, String workspaceName) throws MessagingException {
        String html = "<div style=\"max-width:480px;margin:0 auto;font-family:-apple-system,sans-serif\">"
            + "<div style=\"padding:24px 0;text-align:center\">"
            + "<h2 style=\"color:#4F46E5;margin:0\">TomiHub</h2></div>"
            + "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px 24px\">"
            + "<h3 style=\"margin:0 0 12px;color:#111827;font-size:20px\">🎉 Great news!</h3>"
            + "<p style=\"color:#374151;font-size:14px;line-height:1.6\">"
            + "<strong>" + inviteeName + "</strong> has accepted your invitation and joined "
            + "<strong>" + workspaceName + "</strong>.</p>"
            + "<p style=\"color:#6b7280;font-size:13px;margin-top:16px\">"
            + "You can now collaborate on projects together.</p></div></div>";

        mailSender.send(to, "🎉 " + inviteeName + " has joined " + workspaceName, html);
        log.info("Invite-accepted email sent to {}", to);
    }

    /**
     * Send a verification code email. Does NOT throw — failures are logged silently.
     * This allows the dev-fallback flow (user can still register without email).
     */
    public void sendVerificationCode(String to, String code, String purpose) {
        String subject = switch (purpose) {
            case "register" -> "[TomiHub] Your verification code";
            case "login" -> "[TomiHub] Your login code";
            case "reset_password" -> "[TomiHub] Reset your password";
            default -> "[TomiHub] Verification code";
        };

        String purposeText = switch (purpose) {
            case "register" -> "register your account";
            case "login" -> "sign in";
            case "reset_password" -> "reset your password";
            default -> "verify your identity";
        };

        String html = """
            <div style="max-width:480px;margin:0 auto;font-family:-apple-system,sans-serif">
              <div style="padding:24px 0;text-align:center">
                <h2 style="color:#4F46E5;margin:0">AI-PM</h2>
              </div>
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px 24px">
                <p style="font-size:16px;margin:0 0 12px">Hi,</p>
                <p style="font-size:14px;color:#374151;margin:0 0 24px">
                  Use the code below to %s.
                </p>
                <div style="text-align:center;margin:0 0 24px">
                  <span style="display:inline-block;background:#EEF2FF;color:#4F46E5;
                    font-size:28px;font-weight:700;letter-spacing:8px;padding:12px 32px;
                    border-radius:8px;font-family:monospace">%s</span>
                </div>
                <p style="font-size:12px;color:#9CA3AF;margin:0">
                  This code expires in 5 minutes. If you did not request this, please ignore this email.
                </p>
              </div>
              <p style="font-size:11px;color:#9CA3AF;text-align:center;margin-top:16px">
                AI-PM — AI-Powered Project Manager
              </p>
            </div>
            """.formatted(purposeText, code);

        try {
            mailSender.send(to, subject, html);
            log.info("Verification email sent to {}", to);
        } catch (MessagingException e) {
            log.error("Failed to send verification email to {}: {}", to, e.getMessage());
        }
    }
}
