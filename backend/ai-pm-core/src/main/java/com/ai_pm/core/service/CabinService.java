package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.entity.*;
import com.ai_pm.core.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class CabinService {

    private final PortfolioCabinRepository cabinRepo;
    private final CabinParticipantRepository participantRepo;
    private final CabinEntryRepository entryRepo;
    private final CabinDocumentRepository docRepo;
    private final CabinFeedbackRepository feedbackRepo;
    private final NotificationService notifService;

    // ─── Cabin CRUD ───

    @Transactional(readOnly = true)
    public List<PortfolioCabin> listByUser(String tenantId, String userId) {
        return cabinRepo.findByUser(tenantId, userId);
    }

    @Transactional(readOnly = true)
    public PortfolioCabin getById(String cabinId) {
        PortfolioCabin cabin = cabinRepo.selectById(cabinId);
        if (cabin == null) throw new BusinessException(40400, "Cabin not found");
        return cabin;
    }

    @Transactional
    public PortfolioCabin create(String name, String description, List<String> participantUserIds) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        PortfolioCabin cabin = new PortfolioCabin();
        cabin.setTenantId(tenantId);
        cabin.setName(name.trim());
        cabin.setDescription(description);
        cabin.setCreatedBy(userId);
        cabin.setStatus("open");
        cabinRepo.insert(cabin);

        // Add creator as participant
        addParticipantInternal(cabin.getId(), userId, userId, "participant");

        // Invite other participants with notifications
        if (participantUserIds != null) {
            for (String puid : participantUserIds) {
                if (!puid.equals(userId)) {
                    addParticipantInternal(cabin.getId(), puid, userId, "participant");
                    sendInviteNotification(cabin, puid, userId);
                }
            }
        }

        log.info("Cabin created: id={}, name={}, participants={}", cabin.getId(), name,
                 (participantUserIds != null ? participantUserIds.size() : 0) + 1);
        return cabin;
    }

    @Transactional
    public PortfolioCabin update(String cabinId, String name, String description, String status) {
        PortfolioCabin cabin = getById(cabinId);
        if (name != null) cabin.setName(name);
        if (description != null) cabin.setDescription(description);
        if (status != null) cabin.setStatus(status);
        cabinRepo.updateById(cabin);
        return cabin;
    }

    // ─── Participants ───

    @Transactional(readOnly = true)
    public List<CabinParticipant> listParticipants(String cabinId) {
        return participantRepo.findByCabinId(cabinId);
    }

    @Transactional
    public CabinParticipant addParticipant(String cabinId, String userId, String role) {
        String inviterId = TenantContextHolder.getUserId();
        CabinParticipant p = addParticipantInternal(cabinId, userId, inviterId, role);
        // Self-add (e.g. creator auto-joining as participant) needs no invite notification
        if (!Objects.equals(userId, inviterId)) {
            sendInviteNotification(getById(cabinId), userId, inviterId);
        }
        return p;
    }

    @Transactional
    public void removeParticipant(String cabinId, String userId) {
        CabinParticipant p = participantRepo.findByCabinAndUser(cabinId, userId);
        if (p != null) participantRepo.deleteById(p.getId());
    }

    @Transactional
    public void acceptInvite(String cabinId, String userId) {
        CabinParticipant p = participantRepo.findByCabinAndUser(cabinId, userId);
        if (p != null) {
            p.setStatus("accepted");
            participantRepo.updateById(p);
        }
    }

    private CabinParticipant addParticipantInternal(String cabinId, String userId, String inviterId, String role) {
        CabinParticipant existing = participantRepo.findByCabinAndUser(cabinId, userId);
        if (existing != null) return existing;

        CabinParticipant p = new CabinParticipant();
        p.setCabinId(cabinId);
        p.setUserId(userId);
        p.setInvitedBy(inviterId);
        p.setStatus("pending");
        p.setRole(role != null ? role : "participant");
        participantRepo.insert(p);
        return p;
    }

    private void sendInviteNotification(PortfolioCabin cabin, String targetUserId, String inviterId) {
        // Never notify the inviter about their own action
        if (Objects.equals(targetUserId, inviterId)) return;
        try {
            notifService.createOrReuse(Map.of(
                "type", "cabin_invite",
                "title", "You've been invited to a Meeting",
                "body", "Join '" + cabin.getName() + "' to share your project status.",
                "targetUserId", targetUserId,
                "sourceUserId", inviterId,
                "sourceAgent", "system",
                "actionType", "link",
                "actionPayload", "{\"url\":\"/cabins/" + cabin.getId() + "\"}",
                // Unique per (cabin, invitee) — otherwise createOrReuse dedupe
                // can attach the invite to the wrong user
                "clientRequestId", "cabin-invite-" + cabin.getId() + "-" + targetUserId
            ));
        } catch (Exception e) {
            log.warn("Failed to send cabin invite notification: {}", e.getMessage());
        }
    }

    // ─── Entries ───

    @Transactional(readOnly = true)
    public List<CabinEntry> listEntries(String cabinId) {
        return entryRepo.findByCabinId(cabinId);
    }

    @Transactional
    public CabinEntry attachProject(String cabinId, String projectId, String phase) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        PortfolioCabin cabin = getById(cabinId);
        if (!cabin.getTenantId().equals(tenantId)) {
            throw new BusinessException(40300, "Cabin does not belong to your tenant");
        }

        CabinEntry entry = new CabinEntry();
        entry.setTenantId(tenantId);
        entry.setCabinId(cabinId);
        entry.setProjectId(projectId);
        entry.setPhase(phase);
        entry.setAttachedBy(userId);
        entryRepo.insert(entry);

        log.info("Project {} attached to cabin {} (phase={})", projectId, cabinId, phase);
        return entry;
    }

    @Transactional
    public void detachProject(String cabinId, String entryId) {
        CabinEntry entry = entryRepo.selectById(entryId);
        if (entry == null || !entry.getCabinId().equals(cabinId)) {
            throw new BusinessException(40400, "Entry not found");
        }
        entryRepo.deleteById(entryId);
    }

    // ─── Documents ───

    @Transactional(readOnly = true)
    public CabinDocument getLatestDocument(String cabinId) {
        return docRepo.findLatestByCabinId(cabinId);
    }

    @Transactional(readOnly = true)
    public List<CabinDocument> listDocuments(String cabinId) {
        return docRepo.findByCabinId(cabinId);
    }

    @Transactional
    public CabinDocument saveDocument(String cabinId, String content,
                                       String healthData, String dependencyData, String summaryData) {
        CabinDocument latest = docRepo.findLatestByCabinId(cabinId);
        int nextVersion = (latest != null ? latest.getVersion() : 0) + 1;

        CabinDocument doc = new CabinDocument();
        doc.setCabinId(cabinId);
        doc.setContent(content);
        doc.setHealthData(healthData);
        doc.setDependencyData(dependencyData);
        doc.setSummaryData(summaryData);
        doc.setVersion(nextVersion);
        docRepo.insert(doc);

        log.info("Cabin document saved: cabinId={}, version={}", cabinId, nextVersion);
        return doc;
    }

    // ─── Feedback ───

    @Transactional(readOnly = true)
    public List<CabinFeedback> listFeedback(String cabinId) {
        return feedbackRepo.findByCabinId(cabinId);
    }

    @Transactional
    public CabinFeedback addFeedback(String cabinId, String documentId, String projectId, String feedback) {
        String userId = TenantContextHolder.getUserId();
        CabinFeedback f = new CabinFeedback();
        f.setCabinId(cabinId);
        f.setDocumentId(documentId);
        f.setProjectId(projectId);
        f.setUserId(userId);
        f.setFeedback(feedback);
        feedbackRepo.insert(f);
        log.info("Cabin feedback added: cabinId={}, userId={}", cabinId, userId);
        return f;
    }

    // ─── Authorization ───

    @Transactional
    public void authorize(String cabinId, String userId, List<String> projectIds) {
        String tenantId = TenantContextHolder.getTenantId();
        for (String projectId : projectIds) {
            // Check not already attached
            List<CabinEntry> existing = entryRepo.findByCabinId(cabinId);
            boolean alreadyAttached = existing.stream().anyMatch(e -> e.getProjectId().equals(projectId));
            if (!alreadyAttached) {
                CabinEntry entry = new CabinEntry();
                entry.setTenantId(tenantId);
                entry.setCabinId(cabinId);
                entry.setProjectId(projectId);
                entry.setAttachedBy(userId);
                entryRepo.insert(entry);
            }
        }
        // Mark participant as accepted
        CabinParticipant p = participantRepo.findByCabinAndUser(cabinId, userId);
        if (p != null) {
            p.setStatus("accepted");
            participantRepo.updateById(p);
        }
        log.info("Cabin authorized: cabinId={}, userId={}, projects={}", cabinId, userId, projectIds.size());
    }
}
