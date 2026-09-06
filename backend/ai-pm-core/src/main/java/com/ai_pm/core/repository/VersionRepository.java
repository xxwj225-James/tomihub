package com.ai_pm.core.repository;

import com.ai_pm.core.entity.ProjectVersion;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface VersionRepository extends BaseMapper<ProjectVersion> {

    @Select("SELECT * FROM versions WHERE project_id = #{projectId} ORDER BY sort_order, created_at")
    List<ProjectVersion> findByProjectId(@Param("projectId") String projectId);
}
