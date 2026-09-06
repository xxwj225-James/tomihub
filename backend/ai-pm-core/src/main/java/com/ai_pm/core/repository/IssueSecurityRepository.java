package com.ai_pm.core.repository;

import com.ai_pm.core.entity.IssueSecurityLevel;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.*;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Mapper
public interface IssueSecurityRepository extends BaseMapper<IssueSecurityLevel> {

    @Select("SELECT security_level_id FROM issues WHERE id = #{issueId}")
    UUID findSecurityLevelByIssueId(@Param("issueId") String issueId);

    /**
     * ★ Key query: find ALL security levels visible to a user in a project.
     * Called ONCE and cached — not per-row.
     */
    @Select("""
        SELECT DISTINCT isl.id
        FROM issue_security_levels isl
        JOIN issue_security_members ism ON ism.security_level_id = isl.id
        WHERE isl.project_id = #{projectId}
          AND (ism.user_id = #{userId}
               OR ism.role_id IN (
                   SELECT role_id FROM project_member_roles
                   WHERE user_id = #{userId} AND project_id = #{projectId}
               ))
        """)
    Set<UUID> findVisibleSecurityLevelIds(@Param("projectId") String projectId,
                                           @Param("userId") String userId,
                                           @Param("roleIds") Set<UUID> roleIds);

    @Select("""
        SELECT EXISTS (
            SELECT 1 FROM issue_security_members
            WHERE security_level_id = #{levelId}
              AND (user_id = #{userId}
                   OR role_id IN (SELECT role_id FROM project_member_roles
                                  WHERE user_id = #{userId}))
        )
        """)
    boolean isUserInSecurityLevel(@Param("levelId") UUID levelId,
                                   @Param("userId") String userId);

    @Select("""
        SELECT i.id FROM issues i
        WHERE i.id IN (
            <foreach collection="issueIds" item="id" separator=",">#{id}</foreach>
        )
        AND (
            i.security_level_id IS NULL
            OR i.security_level_id IN (
                SELECT DISTINCT ism.security_level_id
                FROM issue_security_members ism
                WHERE (ism.user_id = #{userId}
                       OR ism.role_id IN (
                           SELECT role_id FROM project_member_roles pmr
                           WHERE pmr.user_id = #{userId}
                             AND pmr.project_id = i.project_id
                       ))
            )
        )
        """)
    Set<String> filterVisibleIssueIds(@Param("issueIds") Set<String> issueIds,
                                       @Param("userId") String userId);

    @Select("SELECT * FROM issue_security_levels WHERE project_id = #{projectId} ORDER BY rank")
    List<IssueSecurityLevel> findByProjectId(@Param("projectId") String projectId);

    @Select("""
        SELECT user_id as id, security_level_id, user_id, NULL as role_id
        FROM issue_security_members WHERE security_level_id = #{levelId} AND user_id IS NOT NULL
        UNION ALL
        SELECT role_id as id, security_level_id, NULL as user_id, role_id
        FROM issue_security_members WHERE security_level_id = #{levelId} AND role_id IS NOT NULL
        """)
    List<IssueSecurityLevel.SecurityMember> findMembersByLevelId(@Param("levelId") String levelId);
}
