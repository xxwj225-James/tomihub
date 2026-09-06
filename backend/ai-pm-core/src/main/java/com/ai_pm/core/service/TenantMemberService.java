package com.ai_pm.core.service;

import com.ai_pm.common.entity.TenantMember;
import com.ai_pm.common.repository.TenantMemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantMemberService {

    private final TenantMemberRepository memberRepo;

    @Transactional(readOnly = true)
    public List<Map<String, String>> listMembersWithNames(String tenantId) {
        return memberRepo.findMembersWithNames(tenantId).stream()
            .map(r -> Map.of(
                "id", r.id(),
                "displayName", r.display_name(),
                "email", r.email(),
                "role", r.role(),
                "status", r.status() != null ? r.status() : "active"))
            .toList();
    }

    /**
     * Returns error message if currentUser cannot manage targetUser, null if allowed.
     */
    public String checkCanManage(String tenantId, String currentUserId, String targetUserId) {
        if (currentUserId == null) return "Not authenticated";
        if (currentUserId.equals(targetUserId)) return "You cannot manage yourself";
        int myLevel = roleLevel(tenantId, currentUserId);
        int targetLevel = roleLevel(tenantId, targetUserId);
        if (myLevel < 0) return "You do not have permission to manage members";
        if (myLevel <= targetLevel) return "You cannot manage members with equal or higher role";
        return null; // allowed
    }

    /**
     * Whether currentUser can remove targetUser from the workspace.
     * Returns error message if not allowed, null if allowed.
     */
    public String checkCanRemove(String tenantId, String currentUserId, String targetUserId) {
        if (currentUserId != null && currentUserId.equals(targetUserId)) {
            return "You cannot remove yourself";
        }
        if (currentUserId != null && memberRepo.isInvitedBy(currentUserId, targetUserId)) {
            return "You cannot remove the person who invited you";
        }
        var currentRole = memberRepo.findByTenantIdAndUserId(tenantId, currentUserId)
            .map(TenantMember::getRole).orElse("");
        var targetRole = memberRepo.findByTenantIdAndUserId(tenantId, targetUserId)
            .map(TenantMember::getRole).orElse("");
        if ("owner".equals(targetRole) && !"owner".equals(currentRole)) {
            return "Only the workspace owner can remove another owner";
        }
        return null;
    }

    @Transactional
    public void updateRole(String tenantId, String userId, String newRole) {
        var currentMember = memberRepo.findByTenantIdAndUserId(tenantId, userId);
        String oldRole = currentMember.map(TenantMember::getRole).orElse("member");
        memberRepo.updateRole(tenantId, userId, oldRole, newRole);
    }

    @Transactional
    public void removeMember(String tenantId, String userId) {
        memberRepo.deleteByTenantAndUser(tenantId, userId);
        memberRepo.deletePendingInvites(userId, tenantId);
    }

    @Transactional
    public void disableMember(String tenantId, String userId) {
        memberRepo.updateStatus(tenantId, userId, "disabled");
    }

    @Transactional
    public void enableMember(String tenantId, String userId) {
        memberRepo.updateStatus(tenantId, userId, "active");
    }

    private int roleLevel(String tenantId, String userId) {
        var m = memberRepo.findByTenantIdAndUserId(tenantId, userId);
        if (m.isEmpty()) return -1;
        return switch (m.get().getRole()) {
            case "owner" -> 3;
            case "admin" -> 2;
            case "member" -> 1;
            case "viewer" -> 0;
            default -> -1;
        };
    }
}
