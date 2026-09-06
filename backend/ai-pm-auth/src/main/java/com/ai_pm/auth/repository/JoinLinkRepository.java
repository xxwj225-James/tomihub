package com.ai_pm.auth.repository;

import com.ai_pm.auth.entity.JoinLink;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.Optional;

@Mapper
public interface JoinLinkRepository extends BaseMapper<JoinLink> {

    @Select("SELECT * FROM join_links WHERE code = #{code} AND is_active = TRUE")
    Optional<JoinLink> findByCode(@Param("code") String code);
}
