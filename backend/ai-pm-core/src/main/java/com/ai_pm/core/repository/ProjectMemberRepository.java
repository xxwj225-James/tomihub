package com.ai_pm.core.repository;

import com.ai_pm.core.entity.ProjectMember;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.*;
import java.util.List;
import java.util.Optional;

@Mapper
public interface ProjectMemberRepository extends BaseMapper<ProjectMember> {

    @Select("""
        SELECT pm.*, u.display_name, u.email
        FROM project_members pm JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = #{projectId} ORDER BY u.display_name
    """)
    @Results({
        @Result(column = "display_name", property = "displayName"),
        @Result(column = "email", property = "email"),
    })
    List<ProjectMember> findByProjectId(@Param("projectId") String projectId);

    /** Paginated: members by project */
    @Select("""
        SELECT pm.*, u.display_name, u.email
        FROM project_members pm JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = #{projectId} ORDER BY u.display_name
    """)
    @Results({
        @Result(column = "display_name", property = "displayName"),
        @Result(column = "email", property = "email"),
    })
    IPage<ProjectMember> findByProjectIdPaged(Page<ProjectMember> page, @Param("projectId") String projectId);

    @Select("SELECT * FROM project_members WHERE project_id = #{projectId} AND user_id = #{userId}")
    Optional<ProjectMember> findByProjectAndUser(@Param("projectId") String projectId, @Param("userId") String userId);

    @Select("SELECT DISTINCT project_id FROM project_members WHERE user_id = #{userId}")
    List<String> findProjectIdsByUserId(@Param("userId") String userId);
}
