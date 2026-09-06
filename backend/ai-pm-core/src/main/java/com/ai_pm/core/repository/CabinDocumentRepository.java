package com.ai_pm.core.repository;

import com.ai_pm.core.entity.CabinDocument;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface CabinDocumentRepository extends BaseMapper<CabinDocument> {

    @Select("SELECT * FROM cabin_documents WHERE cabin_id = #{cabinId} ORDER BY version DESC LIMIT 1")
    CabinDocument findLatestByCabinId(@Param("cabinId") String cabinId);

    @Select("SELECT * FROM cabin_documents WHERE cabin_id = #{cabinId} ORDER BY version DESC")
    List<CabinDocument> findByCabinId(@Param("cabinId") String cabinId);
}
