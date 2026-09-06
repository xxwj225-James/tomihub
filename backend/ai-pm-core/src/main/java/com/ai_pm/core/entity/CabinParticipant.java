package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("cabin_participants")
public class CabinParticipant {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String cabinId;
    private String userId;
    private String invitedBy;
    private String status;      // pending / accepted / declined
    private String role;        // participant (mounts projects) / viewer (read-only)
    private Instant invitedAt;
}
