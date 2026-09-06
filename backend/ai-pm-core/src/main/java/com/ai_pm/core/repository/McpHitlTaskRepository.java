package com.ai_pm.core.repository;

import com.ai_pm.core.entity.McpHitlTask;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Optional;

@Mapper
public interface McpHitlTaskRepository extends BaseMapper<McpHitlTask> {

    @Select("SELECT * FROM mcp_hitl_tasks WHERE tenant_id = #{tenantId} AND status = 'pending' ORDER BY created_at ASC")
    List<McpHitlTask> findPendingByTenant(@Param("tenantId") String tenantId);

    @Select("SELECT * FROM mcp_hitl_tasks WHERE id = #{id} AND status = 'pending'")
    Optional<McpHitlTask> findPendingById(@Param("id") String id);
}
