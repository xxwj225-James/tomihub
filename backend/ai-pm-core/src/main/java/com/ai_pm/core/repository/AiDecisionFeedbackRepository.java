package com.ai_pm.core.repository;

import com.ai_pm.core.entity.AiDecisionFeedback;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AiDecisionFeedbackRepository extends BaseMapper<AiDecisionFeedback> {

    @Insert("INSERT INTO ai_decision_feedbacks (tenant_id, project_id, resource_id, feature_type, ai_output, human_action, human_corrected_output, context, created_at) "
        + "VALUES (#{tenantId}, #{projectId}, #{resourceId}, #{featureType}, #{aiOutput}, #{humanAction}, #{humanCorrectedOutput}, CAST(#{context} AS jsonb), NOW())")
    int capture(@Param("tenantId") String tenantId, @Param("projectId") String projectId,
                @Param("resourceId") String resourceId, @Param("featureType") String featureType,
                @Param("aiOutput") String aiOutput, @Param("humanAction") String humanAction,
                @Param("humanCorrectedOutput") String humanCorrectedOutput,
                @Param("context") String context);
}
