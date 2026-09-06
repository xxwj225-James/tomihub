package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.core.entity.HitlConfig;
import com.ai_pm.core.repository.HitlConfigRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class HitlConfigService {

    private final HitlConfigRepository repo;

    @Transactional(readOnly = true)
    public List<HitlConfig> listByUser() {
        return repo.findByUser(TenantContextHolder.getTenantId(), TenantContextHolder.getUserId());
    }

    @Transactional
    public HitlConfig save(String agentName, String mode, Boolean isGlobalEnabled) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        var existing = repo.findByUserAndAgent(tenantId, userId, agentName).orElse(null);
        if (existing != null) {
            existing.setMode(mode);
            if (isGlobalEnabled != null) existing.setIsGlobalEnabled(isGlobalEnabled);
            repo.updateById(existing);
            return existing;
        } else {
            HitlConfig config = new HitlConfig();
            config.setTenantId(tenantId);
            config.setUserId(userId);
            config.setAgentName(agentName);
            config.setMode(mode);
            config.setIsGlobalEnabled(isGlobalEnabled);
            repo.insert(config);
            return config;
        }
    }

    @Transactional
    public void delete(String id) {
        repo.deleteById(id);
    }

    /** Check if HITL confirmation is required for a given agent. */
    @Transactional(readOnly = true)
    public boolean requiresConfirmation(String agentName) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        // Check global override first
        var global = repo.findByUserAndAgent(tenantId, userId, null).orElse(null);
        if (global != null && Boolean.TRUE.equals(global.getIsGlobalEnabled())) {
            return "manual".equals(global.getMode());
        }

        // Per-agent config
        if (agentName != null) {
            var agentConfig = repo.findByUserAndAgent(tenantId, userId, agentName).orElse(null);
            if (agentConfig != null) return "manual".equals(agentConfig.getMode());
        }

        // Fall back to global mode (even if global disabled, use its mode as default)
        if (global != null) return "manual".equals(global.getMode());

        // Default: manual
        return true;
    }
}
