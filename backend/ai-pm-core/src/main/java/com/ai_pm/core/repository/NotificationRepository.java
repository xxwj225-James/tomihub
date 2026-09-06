package com.ai_pm.core.repository;

import com.ai_pm.core.entity.Notification;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Optional;

@Mapper
public interface NotificationRepository extends BaseMapper<Notification> {

    @Select("SELECT * FROM notifications WHERE tenant_id = #{tenantId} ORDER BY created_at DESC")
    List<Notification> findByTenant(@Param("tenantId") String tenantId);

    @Select("SELECT * FROM notifications WHERE tenant_id = #{tenantId} AND type = #{type} ORDER BY created_at DESC")
    List<Notification> findByTenantAndType(@Param("tenantId") String tenantId, @Param("type") String type);

    @Select("SELECT * FROM notifications WHERE tenant_id = #{tenantId} AND status = #{status} ORDER BY created_at DESC")
    List<Notification> findByTenantAndStatus(@Param("tenantId") String tenantId, @Param("status") String status);

    @Select("SELECT * FROM notifications WHERE tenant_id = #{tenantId} AND type = #{type} AND status = #{status} ORDER BY created_at DESC")
    List<Notification> findByTenantTypeAndStatus(@Param("tenantId") String tenantId, @Param("type") String type, @Param("status") String status);

    @Select("SELECT * FROM notifications WHERE tenant_id = #{tenantId} AND source_agent = #{sourceAgent} AND client_request_id = #{clientRequestId} LIMIT 1")
    Optional<Notification> findByIdempotent(@Param("tenantId") String tenantId, @Param("sourceAgent") String sourceAgent, @Param("clientRequestId") String clientRequestId);

    /** Notifications for current user: targeted to them OR public (null targetUserId) */
    @Select("SELECT * FROM notifications WHERE tenant_id = #{tenantId} AND (target_user_id = #{userId} OR target_user_id IS NULL) ORDER BY created_at DESC")
    List<Notification> findForUser(@Param("tenantId") String tenantId, @Param("userId") String userId);

    @Select("<script>SELECT * FROM notifications WHERE tenant_id = #{tenantId} AND (target_user_id = #{userId} OR target_user_id IS NULL)"
        + "<if test='type != null'> AND type = #{type}</if>"
        + "<if test='status != null'> AND status = #{status}</if>"
        + " ORDER BY created_at DESC</script>")
    List<Notification> findForUserFiltered(@Param("tenantId") String tenantId, @Param("userId") String userId, @Param("type") String type, @Param("status") String status);

    /** Paginated: notifications for user */
    @Select("SELECT * FROM notifications WHERE tenant_id = #{tenantId} AND (target_user_id = #{userId} OR target_user_id IS NULL) ORDER BY created_at DESC")
    IPage<Notification> findForUserPaged(Page<Notification> page, @Param("tenantId") String tenantId, @Param("userId") String userId);

    /** Paginated: notifications for user, type/status filters optional */
    @Select("<script>SELECT * FROM notifications WHERE tenant_id = #{tenantId} AND (target_user_id = #{userId} OR target_user_id IS NULL)"
        + "<if test='type != null'> AND type = #{type}</if>"
        + "<if test='status != null'> AND status = #{status}</if>"
        + " ORDER BY created_at DESC</script>")
    IPage<Notification> findForUserFilteredPaged(Page<Notification> page, @Param("tenantId") String tenantId, @Param("userId") String userId, @Param("type") String type, @Param("status") String status);
}
