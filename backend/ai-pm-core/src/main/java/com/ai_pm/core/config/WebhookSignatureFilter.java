package com.ai_pm.core.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * Validates webhook signatures for incoming requests from Feishu/WeChat Work/MCP agents.
 * X-TomiHub-Signature: HmacSHA256(secret, timestamp + "\n" + body)
 * X-TomiHub-Timestamp: unix timestamp (replay protection, 5-min window)
 */
@Component
@Order(1)
public class WebhookSignatureFilter implements Filter {

    private static final String SECRET = System.getenv().getOrDefault("WEBHOOK_SECRET", "TomiHub-Webhook-2026");
    private static final long TOLERANCE_SECONDS = 300; // 5 minutes

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        String signature = request.getHeader("X-TomiHub-Signature");
        String timestamp = request.getHeader("X-TomiHub-Timestamp");

        // No signature → skip validation (non-webhook requests)
        if (signature == null || timestamp == null) {
            chain.doFilter(req, res);
            return;
        }

        // 1. Replay protection: timestamp must be within ±5 minutes
        try {
            long ts = Long.parseLong(timestamp);
            long now = System.currentTimeMillis() / 1000;
            if (Math.abs(now - ts) > TOLERANCE_SECONDS) {
                sendError(response, 403, "Webhook timestamp expired");
                return;
            }
        } catch (NumberFormatException e) {
            sendError(response, 400, "Invalid webhook timestamp");
            return;
        }

        // 2. Compute expected signature (timestamp + method + path for body-safe verification)
        String payload = timestamp + "\n" + request.getMethod() + "\n" + request.getRequestURI();
        String expected = hmacSha256(SECRET, payload);
        if (!signature.equals(expected)) {
            sendError(response, 403, "Invalid webhook signature");
            return;
        }

        chain.doFilter(req, res);
    }

    private String hmacSha256(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new RuntimeException("HMAC computation failed", e);
        }
    }

    private void sendError(HttpServletResponse res, int code, String msg) throws IOException {
        res.setStatus(code);
        res.setContentType("application/json");
        res.getOutputStream().write(("{\"code\":" + code + ",\"message\":\"" + msg + "\"}").getBytes(StandardCharsets.UTF_8));
    }
}
