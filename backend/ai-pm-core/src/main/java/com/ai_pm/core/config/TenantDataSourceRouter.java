package com.ai_pm.core.config;

import com.ai_pm.common.context.TenantContextHolder;
import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

/**
 * Routes database queries to tenant-specific PostgreSQL instances.
 * Falls back to the default (shared) database when no custom config exists.
 * Supports hot-add of new tenant DataSources via {@link #addTargetDataSource}.
 */
public class TenantDataSourceRouter extends AbstractRoutingDataSource {

    @Override
    protected Object determineCurrentLookupKey() {
        String tenantId = TenantContextHolder.getTenantId();
        if (tenantId != null && getResolvedDataSources() != null && getResolvedDataSources().containsKey(tenantId)) {
            return tenantId;
        }
        return null; // null → default DataSource
    }

    /**
     * Hot-add a tenant DataSource without restarting.
     * Thread-safe: rebuilds the resolved map and calls afterPropertiesSet.
     */
    public synchronized void addTargetDataSource(Object key, DataSource ds) {
        Map<Object, Object> merged = new HashMap<>();
        Map<Object, DataSource> existing = this.getResolvedDataSources();
        if (existing != null) {
            for (var entry : existing.entrySet()) {
                merged.put(entry.getKey(), entry.getValue());
            }
        }
        merged.put(key, ds);
        this.setTargetDataSources(merged);
        this.afterPropertiesSet();
    }
}
