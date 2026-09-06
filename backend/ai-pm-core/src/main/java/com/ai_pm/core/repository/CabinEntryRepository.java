package com.ai_pm.core.repository;

import com.ai_pm.core.entity.CabinEntry;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface CabinEntryRepository extends BaseMapper<CabinEntry> {

    @Select("SELECT ce.*, p.name as projectName, p.key as projectKey FROM cabin_entries ce JOIN projects p ON ce.project_id = p.id WHERE ce.cabin_id = #{cabinId}")
    List<CabinEntry> findByCabinId(@Param("cabinId") String cabinId);
}
