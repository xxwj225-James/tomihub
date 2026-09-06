package com.ai_pm.core.repository;

import com.ai_pm.core.entity.Report;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface ReportRepository extends BaseMapper<Report> {

    /** Custom insert — casts String fields to JSONB for PostgreSQL compatibility */
    @Insert("INSERT INTO reports (id, tenant_id, generated_by, project_id, report_type, "
        + "title, content, original_content, context, status, sent_to, dismissed_by, "
        + "generated_at, sent_at, created_at) VALUES ("
        + "#{id}, #{tenantId}, #{generatedBy}, #{projectId}, #{reportType}, "
        + "#{title}, #{content}, #{originalContent}, "
        + "CAST(#{context} AS jsonb), #{status}, "
        + "CAST(#{sentTo} AS jsonb), CAST(#{dismissedBy} AS jsonb), "
        + "#{generatedAt}, #{sentAt}, #{createdAt})")
    int insertReport(Report r);

    /** Custom update for title+content only — avoids JSONB casting issues */
    @org.apache.ibatis.annotations.Update("UPDATE reports SET title = #{title}, content = #{content} WHERE id = #{id}")
    int updateContent(Report r);

    /** Custom update for send — casts sent_to to JSONB */
    @org.apache.ibatis.annotations.Update("UPDATE reports SET status = #{status}, "
        + "sent_to = CAST(#{sentTo} AS jsonb), sent_at = #{sentAt} WHERE id = #{id}")
    int updateSendStatus(Report r);

    /** Custom update for dismiss — casts dismissed_by to JSONB */
    @org.apache.ibatis.annotations.Update("UPDATE reports SET "
        + "dismissed_by = CAST(#{dismissedBy} AS jsonb) WHERE id = #{id}")
    int updateDismissedBy(Report r);

    @Select("SELECT * FROM reports WHERE tenant_id = #{tenantId} AND generated_by = #{userId} ORDER BY created_at DESC")
    List<Report> findByCreator(@Param("tenantId") String tenantId, @Param("userId") String userId);

    @Select("SELECT * FROM reports WHERE tenant_id = #{tenantId} AND generated_by = #{userId} AND status = #{status} ORDER BY created_at DESC")
    List<Report> findByCreatorAndStatus(@Param("tenantId") String tenantId, @Param("userId") String userId, @Param("status") String status);

    /** Reports shared with this user (in sent_to) and NOT dismissed by them */
    @Select("SELECT * FROM reports WHERE tenant_id = #{tenantId} AND status = 'sent' "
        + "AND sent_to @> CAST('[{\"userId\": \"' || #{userId} || '\"}]' AS jsonb) "
        + "AND (dismissed_by IS NULL OR NOT dismissed_by @> to_jsonb(#{userId}::text)) "
        + "ORDER BY sent_at DESC")
    List<Report> findSharedWithUser(@Param("tenantId") String tenantId, @Param("userId") String userId);
}
