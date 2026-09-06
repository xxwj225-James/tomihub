package com.ai_pm.core;

import com.ai_pm.common.entity.TenantMember;
import com.ai_pm.common.repository.TenantMemberRepository;
import com.ai_pm.core.entity.Role;
import com.ai_pm.core.repository.IssueSecurityRepository;
import com.ai_pm.core.repository.RoleRepository;
import com.ai_pm.core.service.PermissionEvaluator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PermissionEvaluatorTest {

    @Mock RoleRepository roleRepo;
    @Mock IssueSecurityRepository securityRepo;
    @Mock TenantMemberRepository memberRepo;
    @Mock StringRedisTemplate redis;
    @Mock ValueOperations<String, String> valueOps;
    @Mock JdbcTemplate jdbc;

    private PermissionEvaluator evaluator;

    private static final String USER = "user-1";
    private static final String TENANT = "tenant-1";
    private static final String PROJECT = "project-1";

    @BeforeEach
    void setUp() {
        lenient().when(redis.opsForValue()).thenReturn(valueOps);
        evaluator = new PermissionEvaluator(roleRepo, securityRepo, memberRepo, redis, jdbc);
    }

    @Test
    @DisplayName("Tenant Owner bypasses all permission checks")
    void tenantOwnerBypassesAll() {
        // Given: user is tenant owner
        when(memberRepo.findByTenantIdAndUserId(TENANT, USER))
            .thenReturn(Optional.of(createMember("owner")));

        // When: checking any permission
        boolean result = evaluator.hasPermission(USER, TENANT, PROJECT, "PROJECT:DELETE_ISSUES");

        // Then: should return true (owner bypasses)
        assertThat(result).isTrue();
    }

    @Test
    @DisplayName("Developer has project permissions from role")
    void developerHasProjectPermissions() {
        // Given: user is NOT tenant owner, but has Developer role in project
        when(memberRepo.findByTenantIdAndUserId(TENANT, USER))
            .thenReturn(Optional.of(createMember("member")));

        Role devRole = createRole("Developer", List.of(
            "PROJECT:BROWSE", "PROJECT:CREATE_ISSUES", "PROJECT:EDIT_OWN_ISSUES",
            "PROJECT:COMMENT", "PROJECT:VIEW_REPORTS"
        ));
        when(roleRepo.findUserGlobalRoles(USER, TENANT)).thenReturn(List.of());
        when(roleRepo.findUserProjectRoles(USER, PROJECT)).thenReturn(List.of(devRole));

        // When: checking permissions
        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "PROJECT:BROWSE")).isTrue();
        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "PROJECT:CREATE_ISSUES")).isTrue();
        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "PROJECT:EDIT_OWN_ISSUES")).isTrue();
        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "PROJECT:COMMENT")).isTrue();
    }

    @Test
    @DisplayName("Developer cannot delete issues")
    void developerCannotDelete() {
        when(memberRepo.findByTenantIdAndUserId(TENANT, USER))
            .thenReturn(Optional.of(createMember("member")));

        Role devRole = createRole("Developer", List.of("PROJECT:BROWSE"));
        when(roleRepo.findUserGlobalRoles(USER, TENANT)).thenReturn(List.of());
        when(roleRepo.findUserProjectRoles(USER, PROJECT)).thenReturn(List.of(devRole));

        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "PROJECT:DELETE_ISSUES")).isFalse();
    }

    @Test
    @DisplayName("Viewer can browse but not create")
    void viewerBrowseOnly() {
        when(memberRepo.findByTenantIdAndUserId(TENANT, USER))
            .thenReturn(Optional.of(createMember("member")));

        Role viewerRole = createRole("Viewer", List.of("PROJECT:BROWSE", "PROJECT:VIEW_REPORTS"));
        when(roleRepo.findUserGlobalRoles(USER, TENANT)).thenReturn(List.of());
        when(roleRepo.findUserProjectRoles(USER, PROJECT)).thenReturn(List.of(viewerRole));

        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "PROJECT:BROWSE")).isTrue();
        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "PROJECT:CREATE_ISSUES")).isFalse();
    }

    @Test
    @DisplayName("Global Admin permission applies regardless of project")
    void globalAdminPermission() {
        when(memberRepo.findByTenantIdAndUserId(TENANT, USER))
            .thenReturn(Optional.of(createMember("admin")));

        Role adminRole = createRole("Tenant Admin", List.of("GLOBAL:CREATE_PROJECT", "GLOBAL:MANAGE_USERS"));
        when(roleRepo.findUserGlobalRoles(USER, TENANT)).thenReturn(List.of(adminRole));
        when(roleRepo.findUserProjectRoles(USER, PROJECT)).thenReturn(List.of());

        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "GLOBAL:CREATE_PROJECT")).isTrue();
        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "GLOBAL:MANAGE_USERS")).isTrue();
    }

    @Test
    @DisplayName("User with no roles has no permissions")
    void noRolesNoPermissions() {
        when(memberRepo.findByTenantIdAndUserId(TENANT, USER))
            .thenReturn(Optional.of(createMember("member")));
        when(roleRepo.findUserGlobalRoles(USER, TENANT)).thenReturn(List.of());
        when(roleRepo.findUserProjectRoles(USER, PROJECT)).thenReturn(List.of());

        assertThat(evaluator.hasPermission(USER, TENANT, PROJECT, "PROJECT:BROWSE")).isFalse();
    }

    @Test
    @DisplayName("Issue Security: null security level = visible to all")
    void nullSecurityLevelVisible() {
        when(securityRepo.findSecurityLevelByIssueId("ISSUE-1")).thenReturn(null);
        // enforceIssueSecurity should NOT throw for public issue
        evaluator.enforceIssueSecurity(USER, TENANT, "ISSUE-1");
    }

    @Test
    @DisplayName("Issue Security: user not in level = denied (404)")
    void userNotInSecurityLevelDenied() {
        UUID securityLevelId = UUID.randomUUID();
        when(securityRepo.findSecurityLevelByIssueId("ISSUE-1")).thenReturn(securityLevelId);
        when(securityRepo.isUserInSecurityLevel(securityLevelId, USER)).thenReturn(false);

        assertThrows(com.ai_pm.common.exception.IssueNotFoundException.class, () ->
            evaluator.enforceIssueSecurity(USER, TENANT, "ISSUE-1"));
    }

    // ─── helpers ───

    private TenantMember createMember(String role) {
        return new TenantMember() {{
            setTenantId(TENANT);
            setUserId(USER);
            setRole(role);
        }};
    }

    private Role createRole(String name, List<String> permissions) {
        Role role = new Role();
        role.setId(UUID.randomUUID().toString());
        role.setName(name);
        role.setScope(permissions.get(0).startsWith("GLOBAL") ? "global" : "project");
        role.setPermissionCodes(permissions);
        return role;
    }
}
