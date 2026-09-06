package com.ai_pm.core.repository;

import com.ai_pm.core.entity.Project;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.List;
import java.util.Map;

@Mapper
public interface ProjectRepository extends BaseMapper<Project> {

    /** Custom insert — casts settings to JSONB for PostgreSQL compatibility */
    @org.apache.ibatis.annotations.Insert("INSERT INTO projects (id, tenant_id, name, \"key\", description, lead_id, visibility, status, settings, created_at, updated_at) "
        + "VALUES (#{id}, #{tenantId}, #{name}, #{key}, #{description}, #{leadId}, #{visibility}, #{status}, CAST(#{settings} AS jsonb), #{createdAt}, #{updatedAt})")
    int insert(Project p);

    /** Custom update — casts settings to JSONB for PostgreSQL compatibility */
    @Update("UPDATE projects SET name = #{name}, description = #{description}, "
        + "settings = CAST(#{settings} AS jsonb), phase = #{phase}, "
        + "status = #{status}, "
        + "updated_at = NOW() WHERE id = #{id}")
    int updateProject(Project p);

    @Select("SELECT * FROM projects WHERE tenant_id = #{tenantId} ORDER BY created_at DESC")
    List<Project> findByTenantId(@Param("tenantId") String tenantId);

    /** Paginated: projects by tenant */
    @Select("SELECT * FROM projects WHERE tenant_id = #{tenantId} ORDER BY created_at DESC")
    IPage<Project> findByTenantIdPaged(Page<Project> page, @Param("tenantId") String tenantId);

    @Select("SELECT * FROM projects WHERE tenant_id = #{tenantId} AND \"key\" = #{key}")
    Project findByTenantAndKey(@Param("tenantId") String tenantId, @Param("key") String key);

    @Select("SELECT EXISTS(SELECT 1 FROM projects WHERE tenant_id = #{tenantId} AND \"key\" = #{key})")
    boolean existsByTenantAndKey(@Param("tenantId") String tenantId, @Param("key") String key);

    @Select("SELECT " +
            "  COUNT(*) FILTER (WHERE status NOT IN ('done', 'cancelled')) AS open, " +
            "  COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress, " +
            "  COUNT(*) FILTER (WHERE status = 'in_review') AS in_review, " +
            "  COUNT(*) FILTER (WHERE status = 'done') AS done, " +
            "  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled, " +
            "  COUNT(*) AS total " +
            "FROM issues WHERE tenant_id = #{tenantId} AND project_id = #{projectId}")
    List<Map<String, Object>> getIssueStatsByProject(@Param("tenantId") String tenantId, @Param("projectId") String projectId);
}
