package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.common.web.PageResult;
import com.ai_pm.core.entity.Sprint;
import com.ai_pm.core.repository.SprintRepository;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class SprintService {

    private final SprintRepository repo;
    private final PermissionEvaluator permissionEvaluator;

    /** Sprint management requires PROJECT:MANAGE_SPRINTS; internal/system flows pass. */
    private void enforceManageSprints(String projectId) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return;
        permissionEvaluator.enforce(userId, TenantContextHolder.getTenantId(), projectId, "PROJECT:MANAGE_SPRINTS");
    }

    @Transactional(readOnly = true)
    public List<Sprint> listByProject(String projectId) {
        return repo.findByProject(projectId);
    }

    @Transactional(readOnly = true)
    public PageResult<Sprint> listByProjectPaged(String projectId, int pageNum, int size) {
        Page<Sprint> mpPage = new Page<>(pageNum, Math.min(size, 200));
        var result = repo.findByProjectPaged(mpPage, projectId);
        return PageResult.of(result);
    }

    @Transactional
    public Sprint create(String projectId, String name, String goal, LocalDate startDate, LocalDate endDate) {
        enforceManageSprints(projectId);
        Sprint sprint = new Sprint();
        sprint.setProjectId(projectId);
        sprint.setName(name);
        sprint.setGoal(goal);
        sprint.setStartDate(startDate);
        sprint.setEndDate(endDate);
        sprint.setStatus("planning");
        repo.insert(sprint);
        log.info("Sprint created: id={}, name={}", sprint.getId(), name);
        return sprint;
    }

    @Transactional
    public Sprint startSprint(String sprintId) {
        Sprint sprint = repo.selectById(sprintId);
        if (sprint == null) throw new BusinessException(40400, "Sprint not found");
        enforceManageSprints(sprint.getProjectId());
        sprint.setStatus("active");
        sprint.setStartedAt(java.time.Instant.now());
        repo.updateById(sprint);
        return sprint;
    }

    @Transactional
    public Sprint completeSprint(String sprintId) {
        Sprint sprint = repo.selectById(sprintId);
        if (sprint == null) throw new BusinessException(40400, "Sprint not found");
        enforceManageSprints(sprint.getProjectId());
        sprint.setStatus("completed");
        sprint.setCompletedAt(java.time.Instant.now());
        repo.updateById(sprint);
        return sprint;
    }
}
