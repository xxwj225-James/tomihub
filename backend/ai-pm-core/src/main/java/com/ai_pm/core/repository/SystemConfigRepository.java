package com.ai_pm.core.repository;

import com.ai_pm.core.entity.SystemConfig;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Optional;

@Mapper
public interface SystemConfigRepository extends BaseMapper<SystemConfig> {

    @Select("SELECT * FROM system_configs WHERE tenant_id = #{tenantId} ORDER BY key")
    List<SystemConfig> findByTenant(@Param("tenantId") String tenantId);

    @Select("SELECT * FROM system_configs WHERE tenant_id = #{tenantId} AND key = #{key}")
    Optional<SystemConfig> findByTenantAndKey(@Param("tenantId") String tenantId, @Param("key") String key);
}
