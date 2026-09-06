package com.ai_pm.core.repository;

import com.ai_pm.core.entity.Issue;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.List;
import java.util.Optional;

@Mapper
public interface IssueRepository extends BaseMapper<Issue> {

    /** Custom update — casts labels String → text[] for PostgreSQL compatibility */
    @Update("UPDATE issues SET title = #{title}, description = #{description}, "
        + "type = #{type}, status = #{status}, priority = #{priority}, "
        + "assignee_id = #{assigneeId}, reporter_id = #{reporterId}, "
        + "sprint_id = #{sprintId}, story_points = #{storyPoints}, "
        + "remaining_points = #{remainingPoints}, "
        + "sort_order = #{sortOrder}, "
        + "labels = STRING_TO_ARRAY(#{labels}, ','), "
        + "security_level_id = #{securityLevel}, "
        + "reopen_count = #{reopenCount}, "
        + "updated_at = NOW() WHERE id = #{id}")
    int updateIssue(Issue issue);

    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND project_id = #{projectId} ORDER BY created_at DESC")
    List<Issue> findByProject(@Param("tenantId") String tenantId, @Param("projectId") String projectId);

    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND project_id = #{projectId} ORDER BY sort_order ASC NULLS LAST, created_at DESC")
    List<Issue> findByProjectOrdered(@Param("tenantId") String tenantId, @Param("projectId") String projectId);

    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND parent_id = #{parentId} ORDER BY sort_order ASC NULLS LAST, created_at DESC")
    List<Issue> findChildren(@Param("tenantId") String tenantId, @Param("parentId") String parentId);

    @Select("SELECT sort_order FROM issues WHERE project_id = #{projectId} AND sort_order IS NOT NULL AND sort_order < #{currentOrder} ORDER BY sort_order DESC LIMIT 1")
    Double findPreviousRank(@Param("projectId") String projectId, @Param("currentOrder") Double currentOrder);

    @Select("SELECT sort_order FROM issues WHERE project_id = #{projectId} AND sort_order IS NOT NULL AND sort_order > #{currentOrder} ORDER BY sort_order ASC LIMIT 1")
    Double findNextRank(@Param("projectId") String projectId, @Param("currentOrder") Double currentOrder);

    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND id = #{id}")
    Optional<Issue> findByIdAndTenant(@Param("tenantId") String tenantId, @Param("id") String id);

    @Select("SELECT COALESCE(MAX(issue_number), 0) FROM issues WHERE project_id = #{projectId}")
    int maxIssueNumber(@Param("projectId") String projectId);

    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND assignee_id = #{assigneeId} ORDER BY updated_at DESC")
    List<Issue> findMyTasks(@Param("tenantId") String tenantId, @Param("assigneeId") String assigneeId);

    /** Paginated: my tasks */
    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND assignee_id = #{assigneeId} ORDER BY updated_at DESC")
    IPage<Issue> findMyTasksPaged(Page<Issue> page, @Param("tenantId") String tenantId, @Param("assigneeId") String assigneeId);

    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND reporter_id = #{reporterId} ORDER BY created_at DESC")
    List<Issue> findCreatedByMe(@Param("tenantId") String tenantId, @Param("reporterId") String reporterId);

    /** Paginated: created by me */
    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND reporter_id = #{reporterId} ORDER BY created_at DESC")
    IPage<Issue> findCreatedByMePaged(Page<Issue> page, @Param("tenantId") String tenantId, @Param("reporterId") String reporterId);

    /** Paginated: issues by project */
    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND project_id = #{projectId} ORDER BY created_at DESC")
    IPage<Issue> findByProjectPaged(Page<Issue> page, @Param("tenantId") String tenantId, @Param("projectId") String projectId);

    /** Paginated: children by parent */
    @Select("SELECT * FROM issues WHERE tenant_id = #{tenantId} AND parent_id = #{parentId} ORDER BY sort_order ASC NULLS LAST, created_at DESC")
    IPage<Issue> findChildrenPaged(Page<Issue> page, @Param("tenantId") String tenantId, @Param("parentId") String parentId);
}
