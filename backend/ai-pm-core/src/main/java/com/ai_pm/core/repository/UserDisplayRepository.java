package com.ai_pm.core.repository;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * Minimal read-only access to users table for display name lookup.
 * The full User entity lives in ai-pm-auth; core only needs display_name.
 */
@Mapper
public interface UserDisplayRepository {

    @Select("SELECT display_name FROM users WHERE id = #{id}")
    String findDisplayNameById(@Param("id") String id);
}
