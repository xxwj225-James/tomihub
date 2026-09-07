package com.ai_pm.auth.repository;

import com.ai_pm.auth.entity.Invite;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.List;
import java.util.Optional;

@Mapper
public interface InviteRepository extends BaseMapper<Invite> {

    @Select("SELECT * FROM invites WHERE code = #{code} AND status = 'pending'")
    Optional<Invite> findByCode(@Param("code") String code);

    @Select("SELECT EXISTS(SELECT 1 FROM invites WHERE email = #{email} AND tenant_id = #{tenantId} AND status = 'pending')")
    boolean existsPendingByEmailAndTenant(@Param("email") String email, @Param("tenantId") String tenantId);

    @Update("UPDATE invites SET status = 'revoked' WHERE email = #{email} AND tenant_id = #{tenantId} AND status = 'pending'")
    int revokePendingByEmailAndTenant(@Param("email") String email, @Param("tenantId") String tenantId);

    @Select("SELECT * FROM invites WHERE tenant_id = #{tenantId} ORDER BY created_at DESC")
    List<Invite> findByTenantId(@Param("tenantId") String tenantId);
}
