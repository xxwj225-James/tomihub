package com.ai_pm.core.repository;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Map;

@Mapper
public interface WorkflowRepository {

    @Select("SELECT id, name, description, states FROM workflows WHERE methodology_id = #{methodologyId} ORDER BY is_default DESC")
    List<Map<String, Object>> findByMethodology(@Param("methodologyId") String methodologyId);

    @Select("SELECT id, name, description, states FROM workflows ORDER BY is_default DESC")
    List<Map<String, Object>> findAll();
}
