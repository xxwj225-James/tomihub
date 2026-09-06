package com.ai_pm.core.repository;

import com.ai_pm.core.entity.Sprint;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface SprintRepository extends BaseMapper<Sprint> {

    @Select("SELECT * FROM sprints WHERE project_id = #{projectId} ORDER BY start_date DESC")
    List<Sprint> findByProject(@Param("projectId") String projectId);

    /** Paginated: sprints by project */
    @Select("SELECT * FROM sprints WHERE project_id = #{projectId} ORDER BY start_date DESC")
    IPage<Sprint> findByProjectPaged(Page<Sprint> page, @Param("projectId") String projectId);

    @Select("SELECT * FROM sprints WHERE project_id = #{projectId} AND status = 'active' ORDER BY start_date DESC LIMIT 1")
    Sprint findActiveByProject(@Param("projectId") String projectId);
}
