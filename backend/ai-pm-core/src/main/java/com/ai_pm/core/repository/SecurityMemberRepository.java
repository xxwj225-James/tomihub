package com.ai_pm.core.repository;

import org.apache.ibatis.annotations.*;

@Mapper
public interface SecurityMemberRepository {

    @Insert("""
        INSERT INTO issue_security_members (security_level_id, user_id, role_id)
        VALUES (#{levelId}, #{userId}, #{roleId})
        ON CONFLICT (security_level_id, user_id, role_id) DO NOTHING
        """)
    void addMember(@Param("levelId") String levelId,
                   @Param("userId") String userId,
                   @Param("roleId") String roleId);

    @Delete("""
        DELETE FROM issue_security_members
        WHERE security_level_id = #{levelId}
        <if test="userId != null">AND user_id = #{userId}</if>
        <if test="roleId != null">AND role_id = #{roleId}</if>
        """)
    void removeMember(@Param("levelId") String levelId,
                      @Param("userId") String userId,
                      @Param("roleId") String roleId);
}
