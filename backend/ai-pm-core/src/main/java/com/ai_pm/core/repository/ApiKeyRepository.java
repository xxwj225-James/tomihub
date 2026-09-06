package com.ai_pm.core.repository;

import com.ai_pm.core.entity.ApiKey;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Mapper
public interface ApiKeyRepository extends BaseMapper<ApiKey> {

    @Select("SELECT * FROM api_keys WHERE key_hash = #{hash} AND is_active = true")
    Optional<ApiKey> findByHash(@Param("hash") String hash);

    @Select("SELECT * FROM api_keys WHERE tenant_id = #{tenantId} AND user_id = #{userId} ORDER BY created_at DESC")
    List<ApiKey> findByUser(@Param("tenantId") String tenantId, @Param("userId") String userId);

    @Update("UPDATE api_keys SET last_used_at = #{ts} WHERE id = #{id}")
    void updateLastUsed(@Param("id") String id, @Param("ts") Instant ts);

    @Update("UPDATE api_keys SET device_fingerprint = #{fp}, device_name = #{name}, device_bound_at = #{ts} WHERE id = #{id}")
    void bindDevice(@Param("id") String id, @Param("fp") String fingerprint, @Param("name") String deviceName, @Param("ts") Instant ts);
}
