package com.ai_pm.auth.repository;

import com.ai_pm.auth.entity.User;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.Optional;

@Mapper
public interface UserRepository extends BaseMapper<User> {

    @Select("SELECT * FROM users WHERE email = #{email}")
    Optional<User> findByEmail(@Param("email") String email);

    @Select("SELECT * FROM users WHERE id = #{id}")
    Optional<User> findById(@Param("id") String id);

    default boolean existsByEmail(String email) {
        return findByEmail(email).isPresent();
    }

    @Select("SELECT EXISTS(SELECT 1 FROM tenant_members tm JOIN users u ON tm.user_id = u.id WHERE u.email = #{email} AND tm.tenant_id = #{tenantId})")
    boolean isMemberOfTenant(@Param("email") String email, @Param("tenantId") String tenantId);
}
