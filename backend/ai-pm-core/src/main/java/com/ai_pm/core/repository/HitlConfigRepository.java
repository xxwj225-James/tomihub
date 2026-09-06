package com.ai_pm.core.repository;

import com.ai_pm.core.entity.HitlConfig;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Optional;

@Mapper
public interface HitlConfigRepository extends BaseMapper<HitlConfig> {

    @Select("SELECT * FROM hitl_configs WHERE tenant_id = #{tenantId} AND user_id = #{userId} ORDER BY agent_name NULLS FIRST")
    List<HitlConfig> findByUser(@Param("tenantId") String tenantId, @Param("userId") String userId);

    @Select("SELECT * FROM hitl_configs WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND agent_name IS NOT DISTINCT FROM CAST(#{agentName} AS VARCHAR)")
    Optional<HitlConfig> findByUserAndAgent(@Param("tenantId") String tenantId, @Param("userId") String userId, @Param("agentName") String agentName);

    /** Upsert — ON CONFLICT DO UPDATE to avoid race condition */
    @org.apache.ibatis.annotations.Insert("INSERT INTO hitl_configs (id, tenant_id, user_id, agent_name, mode, is_global_enabled, created_at, updated_at) "
        + "VALUES (#{id}, #{tenantId}, #{userId}, #{agentName}, #{mode}, #{isGlobalEnabled}, NOW(), NOW()) "
        + "ON CONFLICT (tenant_id, user_id, agent_name) DO UPDATE SET "
        + "mode = EXCLUDED.mode, is_global_enabled = EXCLUDED.is_global_enabled, updated_at = NOW()")
    int insert(HitlConfig config);
}
