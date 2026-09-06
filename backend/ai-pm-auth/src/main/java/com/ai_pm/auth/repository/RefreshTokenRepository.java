package com.ai_pm.auth.repository;

import com.ai_pm.auth.entity.RefreshToken;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.Optional;

@Mapper
public interface RefreshTokenRepository extends BaseMapper<RefreshToken> {

    @Select("SELECT * FROM refresh_tokens WHERE token_hash = #{hash}")
    Optional<RefreshToken> findByTokenHash(@Param("hash") String hash);

    @Update("UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = #{userId} AND revoked = FALSE")
    int revokeAllForUser(@Param("userId") String userId);

    @Update("UPDATE refresh_tokens SET revoked = TRUE WHERE id = #{id}")
    int revokeById(@Param("id") String id);
}
