package com.ai_pm.core.service;

import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.entity.ProjectVersion;
import com.ai_pm.core.repository.VersionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class VersionService {

    private final VersionRepository versionRepo;

    @Transactional(readOnly = true)
    public List<ProjectVersion> listByProject(String projectId) {
        return versionRepo.findByProjectId(projectId);
    }

    @Transactional
    public ProjectVersion create(String projectId, Map<String, Object> body) {
        ProjectVersion v = new ProjectVersion();
        v.setProjectId(projectId);
        v.setName((String) body.get("name"));
        v.setDescription((String) body.get("description"));
        v.setStatus((String) body.getOrDefault("status", "planned"));
        v.setCategory((String) body.getOrDefault("category", "milestone"));
        if (body.get("startDate") != null)
            v.setStartDate(Instant.parse((String) body.get("startDate")));
        if (body.get("releaseDate") != null)
            v.setReleaseDate(Instant.parse((String) body.get("releaseDate")));
        if (body.get("sortOrder") != null)
            v.setSortOrder(((Number) body.get("sortOrder")).intValue());
        versionRepo.insert(v);
        log.info("Version created: id={}, name={}, projectId={}", v.getId(), v.getName(), projectId);
        return v;
    }

    @Transactional
    public ProjectVersion update(String projectId, String id, Map<String, Object> body) {
        ProjectVersion v = versionRepo.selectById(id);
        if (v == null || !v.getProjectId().equals(projectId))
            throw new BusinessException(40400, "Version not found");
        if (body.containsKey("name")) v.setName((String) body.get("name"));
        if (body.containsKey("description")) v.setDescription((String) body.get("description"));
        if (body.containsKey("status")) v.setStatus((String) body.get("status"));
        if (body.containsKey("category")) v.setCategory((String) body.get("category"));
        if (body.get("startDate") != null)
            v.setStartDate(Instant.parse((String) body.get("startDate")));
        if (body.get("releaseDate") != null)
            v.setReleaseDate(Instant.parse((String) body.get("releaseDate")));
        if (body.get("sortOrder") != null)
            v.setSortOrder(((Number) body.get("sortOrder")).intValue());
        versionRepo.updateById(v);
        return v;
    }

    @Transactional
    public void delete(String projectId, String id) {
        ProjectVersion v = versionRepo.selectById(id);
        if (v == null || !v.getProjectId().equals(projectId))
            throw new BusinessException(40400, "Version not found");
        versionRepo.deleteById(id);
        log.info("Version deleted: id={}, projectId={}", id, projectId);
    }
}
