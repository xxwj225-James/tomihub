package com.ai_pm.auth.dto;

import com.ai_pm.auth.entity.Invite;
import java.time.Instant;

public record InviteVO(
    String id,
    String tenantId,
    String email,
    String code,
    String role,
    String invitedBy,
    Instant expiresAt,
    Instant acceptedAt,
    String status,
    Instant createdAt
) {
    public static InviteVO from(Invite invite) {
        return new InviteVO(
            invite.getId(),
            invite.getTenantId(),
            invite.getEmail(),
            invite.getCode(),
            invite.getRole(),
            invite.getInvitedBy(),
            invite.getExpiresAt(),
            invite.getAcceptedAt(),
            invite.getStatus(),
            invite.getCreatedAt()
        );
    }
}
