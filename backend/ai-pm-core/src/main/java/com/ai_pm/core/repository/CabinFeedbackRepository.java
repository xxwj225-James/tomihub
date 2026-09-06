package com.ai_pm.core.repository;

import com.ai_pm.core.entity.CabinFeedback;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface CabinFeedbackRepository extends BaseMapper<CabinFeedback> {

    @Select("SELECT * FROM cabin_feedback WHERE cabin_id = #{cabinId} ORDER BY created_at ASC")
    List<CabinFeedback> findByCabinId(@Param("cabinId") String cabinId);

    @Select("SELECT * FROM cabin_feedback WHERE document_id = #{documentId} ORDER BY created_at ASC")
    List<CabinFeedback> findByDocumentId(@Param("documentId") String documentId);
}
