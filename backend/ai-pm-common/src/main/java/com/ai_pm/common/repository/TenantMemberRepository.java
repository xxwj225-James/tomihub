package com.ai_pm.common.repository;

import com.ai_pm.common.entity.TenantMember;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.List;
import java.util.Optional;

@Mapper
public interface TenantMemberRepository extends BaseMapper<TenantMember> {

    @Select("SELECT * FROM tenant_members WHERE user_id = #{userId}")
    List<TenantMember> findByUserId(@Param("userId") String userId);

    @Select("SELECT * FROM tenant_members WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    Optional<TenantMember> findByTenantIdAndUserId(
        @Param("tenantId") String tenantId, @Param("userId") String userId);

    @Select("SELECT COUNT(*) FROM tenant_members WHERE user_id = #{userId}")
    int countByUserId(@Param("userId") String userId);

    @Select("SELECT * FROM tenant_members WHERE tenant_id = #{tenantId} AND role = #{role}")
    List<TenantMember> findByTenantIdAndRole(@Param("tenantId") String tenantId, @Param("role") String role);

    @Update("UPDATE tenant_members SET role = #{newRole} WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND role = #{oldRole}")
    int updateRole(@Param("tenantId") String tenantId, @Param("userId") String userId,
                   @Param("oldRole") String oldRole, @Param("newRole") String newRole);

    @Delete("DELETE FROM tenant_members WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    int deleteByTenantAndUser(@Param("tenantId") String tenantId, @Param("userId") String userId);

    @Select("SELECT u.id, u.display_name, u.email, tm.role, COALESCE(tm.status, 'active') as status FROM tenant_members tm JOIN users u ON tm.user_id = u.id WHERE tm.tenant_id = #{tenantId} ORDER BY u.display_name")
    List<com.ai_pm.common.repository.MemberRow> findMembersWithNames(@Param("tenantId") String tenantId);

    /** Check if targetUserId is the one who invited currentUserId (via accepted invite). */
    @Select("SELECT EXISTS(SELECT 1 FROM invites WHERE email = (SELECT email FROM users WHERE id = #{currentUserId}) AND invited_by = #{targetUserId} AND status = 'accepted')")
    boolean isInvitedBy(@Param("currentUserId") String currentUserId, @Param("targetUserId") String targetUserId);

    @Update("UPDATE tenant_members SET status = #{status} WHERE tenant_id = #{tenantId} AND user_id = #{userId}")
    int updateStatus(@Param("tenantId") String tenantId, @Param("userId") String userId, @Param("status") String status);

    /** Delete pending invites for a user's email in a tenant. */
    @Delete("DELETE FROM invites WHERE email = (SELECT u.email FROM users u WHERE u.id = #{userId}) AND tenant_id = #{tenantId} AND status = 'pending'")
    int deletePendingInvites(@Param("userId") String userId, @Param("tenantId") String tenantId);

    /** Explicit insert — bypasses MyBatis-Plus BaseMapper auto-fill issues. */
    @org.apache.ibatis.annotations.Insert("INSERT INTO tenant_members (id, tenant_id, user_id, role, joined_at) VALUES (#{id}, #{tenantId}, #{userId}, #{role}, NOW())")
    int insertMember(@Param("member") TenantMember member);
}
