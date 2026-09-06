package com.ai_pm.auth.repository;

import com.ai_pm.auth.entity.Tenant;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.Optional;

@Mapper
public interface TenantRepository extends BaseMapper<Tenant> {

    @Select("SELECT * FROM tenants WHERE slug = #{slug}")
    Optional<Tenant> findBySlug(@Param("slug") String slug);

    @Select("SELECT * FROM tenants WHERE id = #{id}")
    Optional<Tenant> findById(@Param("id") String id);
}
