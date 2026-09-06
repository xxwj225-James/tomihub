package com.ai_pm.core.repository;

import com.ai_pm.core.entity.CabinParticipant;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface CabinParticipantRepository extends BaseMapper<CabinParticipant> {

    @Select("SELECT * FROM cabin_participants WHERE cabin_id = #{cabinId}")
    List<CabinParticipant> findByCabinId(@Param("cabinId") String cabinId);

    @Select("SELECT * FROM cabin_participants WHERE cabin_id = #{cabinId} AND user_id = #{userId}")
    CabinParticipant findByCabinAndUser(@Param("cabinId") String cabinId, @Param("userId") String userId);
}
