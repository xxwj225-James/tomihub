package com.ai_pm.core.service;

import java.util.Set;
import java.util.UUID;

/**
 * Pre-computed security level filter for issue list queries.
 *
 * Usage in MyBatis XML:
 *   NO_FILTER    → add no WHERE clause (Owner)
 *   PUBLIC_ONLY  → AND security_level_id IS NULL
 *   RESTRICTED   → AND (security_level_id IS NULL OR security_level_id IN (...))
 */
public class SecurityLevelFilter {

    public enum Type { NO_FILTER, PUBLIC_ONLY, RESTRICTED }

    public static final SecurityLevelFilter NO_FILTER = new SecurityLevelFilter(Type.NO_FILTER, null);
    public static final SecurityLevelFilter PUBLIC_ONLY = new SecurityLevelFilter(Type.PUBLIC_ONLY, null);

    private final Type type;
    private final Set<UUID> visibleLevelIds;

    private SecurityLevelFilter(Type type, Set<UUID> visibleLevelIds) {
        this.type = type;
        this.visibleLevelIds = visibleLevelIds;
    }

    public SecurityLevelFilter(Set<UUID> visibleLevelIds) {
        this(visibleLevelIds.isEmpty() ? Type.PUBLIC_ONLY : Type.RESTRICTED,
             visibleLevelIds.isEmpty() ? null : Set.copyOf(visibleLevelIds));
    }

    public Type getType() { return type; }
    public Set<UUID> getVisibleLevelIds() { return visibleLevelIds; }
    public boolean isOwner() { return type == Type.NO_FILTER; }
}
