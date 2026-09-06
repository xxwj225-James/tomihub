package com.ai_pm.auth.repository;

import org.apache.ibatis.annotations.*;
import java.util.List;
import java.util.Map;

@Mapper
public interface SystemConfigRepository {

    @Select("SELECT key, value FROM system_configs")
    List<Map<String, String>> findAll();

    @Select("SELECT value FROM system_configs WHERE key = #{key}")
    String findByKey(@Param("key") String key);

    @Update("UPDATE system_configs SET value = #{value}, updated_at = NOW(), updated_by = #{userId} WHERE key = #{key}")
    int update(@Param("key") String key, @Param("value") String value, @Param("userId") String userId);

    @Insert("INSERT INTO system_configs (id, key, value, updated_at, updated_by) " +
            "VALUES (gen_random_uuid()::VARCHAR, #{key}, #{value}, NOW(), #{userId}) " +
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = #{userId}")
    int upsert(@Param("key") String key, @Param("value") String value, @Param("userId") String userId);
}
