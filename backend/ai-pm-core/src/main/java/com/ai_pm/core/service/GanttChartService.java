package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.entity.GanttChart;
import com.ai_pm.core.repository.GanttChartRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class GanttChartService {

    private final GanttChartRepository repo;
    private final PermissionEvaluator permissionEvaluator;

    /** Gantt planning requires PROJECT:MANAGE_SPRINTS; internal/system flows pass. */
    private void enforcePlan(String projectId) {
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return;
        permissionEvaluator.enforce(userId, TenantContextHolder.getTenantId(), projectId, "PROJECT:MANAGE_SPRINTS");
    }

    @Transactional(readOnly = true)
    public List<GanttChart> listByProject(String tenantId, String projectId) {
        return repo.findByProject(tenantId, projectId);
    }

    @Transactional
    public GanttChart create(String projectId, String title, String chartDataJsonb, String aiRationale) {
        enforcePlan(projectId);
        String tenantId = TenantContextHolder.getTenantId();
        GanttChart chart = new GanttChart();
        chart.setTenantId(tenantId);
        chart.setProjectId(projectId);
        chart.setTitle(title);
        chart.setChartDataJsonb(chartDataJsonb);
        chart.setAiRationale(aiRationale);
        chart.setIsActive(true);
        repo.insert(chart);
        log.info("Gantt chart created: id={}, project={}", chart.getId(), projectId);
        return chart;
    }

    @Transactional
    public GanttChart update(Long chartId, String chartDataJsonb, String aiRationale) {
        GanttChart chart = repo.selectById(chartId);
        if (chart == null) throw new BusinessException(40400, "Gantt chart not found");
        enforcePlan(chart.getProjectId());
        if (chartDataJsonb != null) chart.setChartDataJsonb(chartDataJsonb);
        if (aiRationale != null) chart.setAiRationale(aiRationale);
        repo.updateById(chart);
        return chart;
    }

    @Transactional
    public void deactivate(Long chartId) {
        GanttChart chart = repo.selectById(chartId);
        if (chart == null) throw new BusinessException(40400, "Gantt chart not found");
        enforcePlan(chart.getProjectId());
        chart.setIsActive(false);
        repo.updateById(chart);
    }
}
