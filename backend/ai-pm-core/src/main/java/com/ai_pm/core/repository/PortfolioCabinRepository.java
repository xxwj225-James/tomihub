package com.ai_pm.core.repository;

import com.ai_pm.core.entity.PortfolioCabin;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface PortfolioCabinRepository extends BaseMapper<PortfolioCabin> {

    @Select("""
        SELECT DISTINCT c.* FROM portfolio_cabins c
        LEFT JOIN cabin_participants p ON c.id = p.cabin_id
        WHERE c.tenant_id = #{tenantId}
          AND (c.created_by = #{userId} OR p.user_id = #{userId})
        ORDER BY c.created_at DESC
    """)
    List<PortfolioCabin> findByUser(@Param("tenantId") String tenantId, @Param("userId") String userId);
}
