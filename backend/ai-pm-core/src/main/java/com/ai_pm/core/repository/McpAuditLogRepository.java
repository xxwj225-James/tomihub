package com.ai_pm.core.repository;

import com.ai_pm.core.entity.McpAuditLog;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface McpAuditLogRepository extends BaseMapper<McpAuditLog> {

    @Select("SELECT * FROM mcp_audit_logs WHERE tenant_id = #{tenantId} ORDER BY created_at DESC")
    List<McpAuditLog> findByTenant(@Param("tenantId") String tenantId);
}
