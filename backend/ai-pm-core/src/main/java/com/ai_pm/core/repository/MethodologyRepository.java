package com.ai_pm.core.repository;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Map;

@Mapper
public interface MethodologyRepository {

    @Select("SELECT id, name, description, icon FROM project_methodologies WHERE tenant_id = '00000000-0000-0000-0000-000000000000' ORDER BY sort_order")
    List<Map<String, Object>> findAll();
}
