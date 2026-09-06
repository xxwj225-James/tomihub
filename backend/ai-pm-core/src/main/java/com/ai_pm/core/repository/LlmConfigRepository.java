package com.ai_pm.core.repository;

import com.ai_pm.core.entity.LlmConfig;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface LlmConfigRepository extends BaseMapper<LlmConfig> {
}
