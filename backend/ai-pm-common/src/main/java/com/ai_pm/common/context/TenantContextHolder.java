package com.ai_pm.common.context;

/**
 * Thread-local tenant context.
 *
 * Set by Gateway filter from JWT claims.
 * Used by MyBatis-Plus TenantLineInterceptor and TenantAwareDataSource.
 * MUST be cleared in finally block to prevent thread-pool contamination.
 */
public final class TenantContextHolder {

    private static final ThreadLocal<TenantContext> CONTEXT = new ThreadLocal<>();

    private TenantContextHolder() {}

    public static void set(String tenantId, String userId) {
        CONTEXT.set(new TenantContext(tenantId, userId, null, null));
    }

    public static void set(String tenantId, String userId, String agentName) {
        CONTEXT.set(new TenantContext(tenantId, userId, agentName, null));
    }

    public static void set(String tenantId, String userId, String agentName, String displayName) {
        CONTEXT.set(new TenantContext(tenantId, userId, agentName, displayName));
    }

    public static String getTenantId() {
        TenantContext ctx = CONTEXT.get();
        return ctx != null ? ctx.tenantId() : null;
    }

    public static String getUserId() {
        TenantContext ctx = CONTEXT.get();
        return ctx != null ? ctx.userId() : null;
    }

    public static String getAgentName() {
        TenantContext ctx = CONTEXT.get();
        return ctx != null ? ctx.agentName() : null;
    }

    public static String getDisplayName() {
        TenantContext ctx = CONTEXT.get();
        return ctx != null ? ctx.displayName() : null;
    }

    public static TenantContext get() {
        return CONTEXT.get();
    }

    public static void clear() {
        CONTEXT.remove();
    }

    public record TenantContext(String tenantId, String userId, String agentName, String displayName) {
        public boolean isPresent() {
            return tenantId != null && userId != null;
        }
    }
}
