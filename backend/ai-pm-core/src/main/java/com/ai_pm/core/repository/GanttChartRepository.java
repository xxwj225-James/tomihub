package com.ai_pm.core.repository;

import com.ai_pm.core.entity.GanttChart;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface GanttChartRepository extends BaseMapper<GanttChart> {

    /** Custom insert — casts chart_data_jsonb to JSONB for PostgreSQL */
    @org.apache.ibatis.annotations.Insert("INSERT INTO ai_gantt_charts (tenant_id, project_id, title, chart_data_jsonb, ai_rationale, is_active, created_at, updated_at) "
        + "VALUES (#{tenantId}, #{projectId}, #{title}, CAST(#{chartDataJsonb} AS jsonb), #{aiRationale}, #{isActive}, #{createdAt}, #{updatedAt})")
    int insert(GanttChart chart);

    @Select("SELECT * FROM ai_gantt_charts WHERE tenant_id = #{tenantId} AND project_id = #{projectId} AND is_active = TRUE ORDER BY updated_at DESC")
    List<GanttChart> findByProject(@Param("tenantId") String tenantId, @Param("projectId") String projectId);
}
