package com.ai_pm.common.id;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * UUID v7 (time-ordered) generator.
 *
 * UUID v7 format: 48-bit Unix ms timestamp | 4-bit version(7) | 62 random bits
 * Benefits over UUID v4:
 *   - Time-sortable → no B-Tree page splits in PostgreSQL
 *   - 16 bytes in PG UUID type → 4x smaller index than VARCHAR(64)
 */
public final class UuidV7Generator {

    private static final SecureRandom RANDOM = new SecureRandom();

    private UuidV7Generator() {}

    public static UUID generate() {
        long timestamp = System.currentTimeMillis();
        byte[] randomBytes = new byte[10];
        RANDOM.nextBytes(randomBytes);

        long msb = (timestamp << 16)
                | (0x7L << 12)  // version = 7
                | ((long) (randomBytes[0] & 0xFF) << 4)
                | ((long) (randomBytes[1] & 0xF0) >>> 4);

        long lsb = ((long) 0x8 << 60)  // variant = 10xx
                | ((long) (randomBytes[1] & 0x0F) << 56)
                | ((long) (randomBytes[2] & 0xFF) << 48)
                | ((long) (randomBytes[3] & 0xFF) << 40)
                | ((long) (randomBytes[4] & 0xFF) << 32)
                | ((long) (randomBytes[5] & 0xFF) << 24)
                | ((long) (randomBytes[6] & 0xFF) << 16)
                | ((long) (randomBytes[7] & 0xFF) << 8)
                | ((long) (randomBytes[8] & 0xFF));

        return new UUID(msb, lsb);
    }

    public static String generateString() {
        return generate().toString();
    }
}
