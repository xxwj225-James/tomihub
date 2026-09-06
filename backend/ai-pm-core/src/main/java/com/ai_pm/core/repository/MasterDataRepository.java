package com.ai_pm.core.repository;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Map;

@Mapper
public interface MasterDataRepository {

    /**
     * Global defaults only (methodology-independent rows). Methodology-specific
     * rows live alongside (032 migration made (category, key, methodology) the
     * PK), so callers without a methodology must NOT see the duplicates.
     */
    @Select("SELECT key, value, icon, color, sort_order FROM master_data WHERE category = #{category} AND (methodology IS NULL OR methodology = '') ORDER BY sort_order")
    List<Map<String, Object>> findByCategory(@Param("category") String category);

    @Select("SELECT key, value, icon, color, sort_order FROM master_data WHERE category = #{category} AND methodology = #{methodology} ORDER BY sort_order")
    List<Map<String, Object>> findByCategoryAndMethodology(@Param("category") String category, @Param("methodology") String methodology);
}
