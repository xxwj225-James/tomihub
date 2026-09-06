package com.ai_pm.core.repository;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ProjectMemberRoleRepository {

    @Insert("""
        INSERT INTO project_member_roles (project_id, user_id, role_id, granted_by)
        VALUES (#{projectId}, #{userId}, #{roleId}, #{grantedBy})
        ON CONFLICT (project_id, user_id, role_id) DO NOTHING
        """)
    void assignRole(@Param("projectId") String projectId,
                    @Param("userId") String userId,
                    @Param("roleId") String roleId,
                    @Param("grantedBy") String grantedBy);

    @Delete("""
        DELETE FROM project_member_roles
        WHERE project_id = #{projectId} AND user_id = #{userId} AND role_id = #{roleId}
        """)
    void revokeRole(@Param("projectId") String projectId,
                    @Param("userId") String userId,
                    @Param("roleId") String roleId);

    @Select("""
        SELECT role_id FROM project_member_roles
        WHERE project_id = #{projectId} AND user_id = #{userId}
        """)
    List<String> findRoleIdsByUser(@Param("projectId") String projectId,
                                    @Param("userId") String userId);
}
