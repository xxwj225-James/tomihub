package com.ai_pm.core.service;

import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.entity.IssueSecurityLevel;
import com.ai_pm.core.repository.IssueSecurityRepository;
import com.ai_pm.core.repository.SecurityMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class IssueSecurityService {

    private final IssueSecurityRepository securityRepo;
    private final SecurityMemberRepository memberRepo;

    @Transactional(readOnly = true)
    public List<IssueSecurityLevel> listLevels(String projectId) {
        List<IssueSecurityLevel> levels = securityRepo.findByProjectId(projectId);
        for (IssueSecurityLevel level : levels) {
            level.setMembers(securityRepo.findMembersByLevelId(level.getId()));
        }
        return levels;
    }

    @Transactional
    public IssueSecurityLevel createLevel(String projectId, String name,
                                           String description, Integer rank) {
        IssueSecurityLevel level = new IssueSecurityLevel();
        level.setProjectId(projectId);
        level.setName(name);
        level.setDescription(description);
        level.setRank(rank != null ? rank : 0);
        level.setIsDefault(false);
        securityRepo.insert(level);
        return level;
    }

    @Transactional
    public void deleteLevel(String levelId) {
        // Check no issues reference this level
        // (handled by FK constraint or manual check)
        securityRepo.deleteById(levelId);
    }

    @Transactional
    public void addMember(String levelId, String userId, String roleId) {
        if ((userId == null || userId.isBlank()) && (roleId == null || roleId.isBlank())) {
            throw new BusinessException(40013, "Must specify user_id or role_id");
        }
        memberRepo.addMember(levelId, userId, roleId);
    }

    @Transactional
    public void removeMember(String levelId, String userId, String roleId) {
        memberRepo.removeMember(levelId, userId, roleId);
    }
}
