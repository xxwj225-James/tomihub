package com.ai_pm.core.repository;

import com.ai_pm.core.entity.Role;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.*;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Mapper
public interface RoleRepository extends BaseMapper<Role> {

    @Select("""
        SELECT r.* FROM roles r
        WHERE r.tenant_id = #{tenantId} AND r.scope = 'global'
        AND r.id IN (
            SELECT role_id FROM tenant_member_roles
            WHERE user_id = #{userId} AND tenant_id = #{tenantId}
        )
        """)
    @Results({
        @Result(column = "id", property = "id"),
        @Result(column = "id", property = "permissionCodes",
                many = @Many(select = "findPermissionCodesByRoleId"))
    })
    List<Role> findUserGlobalRoles(@Param("userId") String userId,
                                    @Param("tenantId") String tenantId);

    @Select("""
        SELECT r.* FROM roles r
        WHERE r.scope = 'project'
        AND r.id IN (
            SELECT role_id FROM project_member_roles
            WHERE user_id = #{userId} AND project_id = #{projectId}
        )
        """)
    @Results({
        @Result(column = "id", property = "id"),
        @Result(column = "id", property = "permissionCodes",
                many = @Many(select = "findPermissionCodesByRoleId"))
    })
    List<Role> findUserProjectRoles(@Param("userId") String userId,
                                     @Param("projectId") String projectId);

    @Select("SELECT permission_code FROM role_permissions WHERE role_id = #{roleId}")
    List<String> findPermissionCodesByRoleId(@Param("roleId") String roleId);

    @Select("SELECT role_id FROM project_member_roles WHERE user_id = #{userId} AND project_id = #{projectId}")
    Set<UUID> findUserProjectRoleIds(@Param("userId") String userId,
                                      @Param("projectId") String projectId);

    @Select("SELECT * FROM roles WHERE tenant_id = #{tenantId} ORDER BY scope, name")
    List<Role> findByTenantId(@Param("tenantId") String tenantId);

    @Select("SELECT * FROM roles WHERE tenant_id = #{tenantId} AND scope = #{scope}")
    List<Role> findByTenantAndScope(@Param("tenantId") String tenantId,
                                     @Param("scope") String scope);

    /** Look up role ID by name + scope. Used when adding members. */
    @Select("SELECT id FROM roles WHERE name = #{name} AND scope = 'project' LIMIT 1")
    String findProjectRoleIdByName(@Param("name") String name);

    /** Look up a project-scoped role by name (system template roles included). */
    @Select("SELECT * FROM roles WHERE name = #{name} AND scope = 'project' ORDER BY is_system DESC LIMIT 1")
    Role findProjectRoleByName(@Param("name") String name);

    // ─── Permission assignment ───

    @Insert("""
        <script>
        INSERT INTO role_permissions (role_id, permission_code) VALUES
        <foreach collection='codes' item='code' separator=','>
            (#{roleId}, #{code})
        </foreach>
        ON CONFLICT (role_id, permission_code) DO NOTHING
        </script>
        """)
    void assignPermissions(@Param("roleId") String roleId,
                           @Param("codes") List<String> permissionCodes);

    @Delete("DELETE FROM role_permissions WHERE role_id = #{roleId}")
    void removePermissions(@Param("roleId") String roleId);
}
