package com.ai_pm.auth.repository;

import com.ai_pm.auth.entity.EmailVerification;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.Optional;

@Mapper
public interface EmailVerificationRepository extends BaseMapper<EmailVerification> {

    @Update("UPDATE email_verifications SET used = TRUE " +
            "WHERE email = #{email} AND code = #{code} AND purpose = #{purpose} AND used = FALSE")
    int markUsed(@Param("email") String email,
                 @Param("code") String code,
                 @Param("purpose") String purpose);

    @Select("SELECT * FROM email_verifications WHERE email = #{email} AND purpose = #{purpose} AND used = FALSE ORDER BY created_at DESC LIMIT 1")
    Optional<EmailVerification> findLatest(@Param("email") String email, @Param("purpose") String purpose);
}
