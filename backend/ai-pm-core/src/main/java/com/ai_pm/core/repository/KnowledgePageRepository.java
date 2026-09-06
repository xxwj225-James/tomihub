package com.ai_pm.core.repository;

import com.ai_pm.core.entity.KnowledgePage;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.List;

@Mapper
public interface KnowledgePageRepository extends BaseMapper<KnowledgePage> {

    @Select("""
        SELECT * FROM knowledge_pages
        WHERE project_id = #{projectId} AND status != 'archived'
        ORDER BY updated_at DESC
        """)
    List<KnowledgePage> findByProjectId(@Param("projectId") String projectId);

    @Select("""
        SELECT * FROM knowledge_pages
        WHERE project_id = #{projectId} AND category = #{category} AND status != 'archived'
        ORDER BY updated_at DESC
        """)
    List<KnowledgePage> findByProjectAndCategory(@Param("projectId") String projectId,
                                                   @Param("category") String category);

    @Update("UPDATE knowledge_pages SET last_accessed_at = #{ts} WHERE id = #{id}")
    void touchLastAccessed(@Param("id") String id, @Param("ts") java.time.Instant ts);
}
