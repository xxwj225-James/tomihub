package com.ai_pm.core.repository;

import com.ai_pm.core.entity.Comment;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Map;

@Mapper
public interface CommentRepository extends BaseMapper<Comment> {

    @Select("SELECT * FROM comments WHERE issue_id = #{issueId} ORDER BY created_at ASC")
    List<Comment> findByIssueId(@Param("issueId") String issueId);

    /** Paginated: comments by issue */
    @Select("SELECT * FROM comments WHERE issue_id = #{issueId} ORDER BY created_at ASC")
    IPage<Comment> findByIssueIdPaged(Page<Comment> page, @Param("issueId") String issueId);

    @Select("SELECT tenant_id, project_id FROM issues WHERE id = #{issueId}")
    Map<String, String> findIssueContext(@Param("issueId") String issueId);
}
