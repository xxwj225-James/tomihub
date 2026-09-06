package com.ai_pm.auth.service;

import com.ai_pm.auth.entity.EmailVerification;
import com.ai_pm.auth.repository.EmailVerificationRepository;
import com.ai_pm.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class VerificationCodeService {

    private final EmailVerificationRepository verificationRepo;
    private final StringRedisTemplate redis;
    private final SecureRandom random = new SecureRandom();

    private static final Duration CODE_TTL = Duration.ofMinutes(5);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);

    /**
     * Generate a 6-digit verification code.
     */
    public String generateCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }

    /**
     * Store code in DB (+ Redis if available) and enforce resend cooldown.
     */
    @Transactional
    public void storeCode(String email, String code, String purpose) {
        // Check resend cooldown (skip if Redis unavailable — dev mode)
        try {
            String cooldownKey = "vcode:cooldown:" + email + ":" + purpose;
            Boolean locked = redis.opsForValue().setIfAbsent(cooldownKey, "1", RESEND_COOLDOWN);
            if (locked != null && !locked) {
                Long ttl = redis.getExpire(cooldownKey);
                throw new BusinessException(42901,
                    "Too frequent. Retry after " + (ttl != null ? ttl : 60) + " seconds");
            }
        } catch (Exception e) {
            log.debug("Redis unavailable — skipping cooldown check");
        }

        // Store in DB
        EmailVerification ev = new EmailVerification();
        ev.setEmail(email);
        ev.setCode(code);
        ev.setPurpose(purpose);
        ev.setExpiresAt(Instant.now().plus(CODE_TTL));
        ev.setUsed(false);
        verificationRepo.insert(ev);

        log.info("Verification code for {} (purpose={}): {}", email, purpose, code);

        // Also store in Redis if available
        try {
            String redisKey = "vcode:" + email + ":" + purpose;
            redis.opsForValue().set(redisKey, code, CODE_TTL);
        } catch (Exception e) {
            log.debug("Redis unavailable — code stored in DB only");
        }
    }

    /**
     * Verify the code. Consumes it on success.
     * Tries Redis first, falls back to DB.
     */
    @Transactional
    public void verifyCode(String email, String code, String purpose) {
        // Try Redis first
        try {
            String redisKey = "vcode:" + email + ":" + purpose;
            String stored = redis.opsForValue().get(redisKey);
            if (stored != null) {
                if (!stored.equals(code)) throw new BusinessException(40002, "Invalid code");
                redis.delete(redisKey);
                verificationRepo.markUsed(email, code, purpose);
                return;
            }
        } catch (Exception e) {
            log.debug("Redis unavailable — verifying from DB");
        }

        // Fallback: verify from DB
        EmailVerification ev = verificationRepo.findLatest(email, purpose)
            .orElseThrow(() -> new BusinessException(40002, "Code expired. Please request a new one"));
        if (ev.getExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException(40002, "Code expired. Please request a new one");
        }
        if (!ev.getCode().equals(code)) {
            throw new BusinessException(40002, "Invalid code");
        }
        verificationRepo.markUsed(email, code, purpose);
    }
}
