package com.ai_pm.core.repository;

import com.ai_pm.core.entity.AiTrainingPair;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AiTrainingPairRepository extends BaseMapper<AiTrainingPair> {

    @Insert("INSERT INTO ai_training_pairs (tenant_id, resource_id, task_type, input_prompt, correct_output, ai_output, quality_score, created_at) "
        + "VALUES (#{tenantId}, #{resourceId}, #{taskType}, #{inputPrompt}, #{correctOutput}, #{aiOutput}, #{qualityScore}, NOW())")
    int insertPair(@Param("tenantId") String tenantId, @Param("resourceId") String resourceId,
                   @Param("taskType") String taskType, @Param("inputPrompt") String inputPrompt,
                   @Param("correctOutput") String correctOutput, @Param("aiOutput") String aiOutput,
                   @Param("qualityScore") Double qualityScore);
}
