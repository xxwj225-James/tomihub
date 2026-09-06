package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.BusinessException;
import com.ai_pm.core.entity.KnowledgePage;
import com.ai_pm.core.event.EmbeddingEvent;
import com.ai_pm.core.repository.KnowledgePageRepository;
import com.ai_pm.core.repository.UserDisplayRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class KnowledgePageService {

    private final KnowledgePageRepository kbRepo;
    private final ApplicationEventPublisher eventPublisher;
    private final ProjectService projectService;
    private final UserDisplayRepository userDisplayRepo;

    public record CreatePageRequest(String title, String content, String category, String status, Boolean isSample) {}
    public record UpdatePageRequest(String title, String content, String category, String status) {}

    @Transactional(readOnly = true)
    public List<KnowledgePage> listByProject(String projectId) {
        List<KnowledgePage> pages = kbRepo.findByProjectId(projectId);
        fillCreatorNames(pages);
        return pages;
    }

    @Transactional(readOnly = true)
    public List<KnowledgePage> listByCategory(String projectId, String category) {
        List<KnowledgePage> pages = kbRepo.findByProjectAndCategory(projectId, category);
        fillCreatorNames(pages);
        return pages;
    }

    private void fillCreatorNames(List<KnowledgePage> pages) {
        for (KnowledgePage p : pages) {
            if (p.getCreatedBy() != null && !p.getCreatedBy().isBlank()) {
                p.setCreatedByName(userDisplayRepo.findDisplayNameById(p.getCreatedBy()));
            }
        }
    }

    @Transactional(readOnly = true)
    public KnowledgePage getById(String id) {
        KnowledgePage page = kbRepo.selectById(id);
        if (page == null) throw new BusinessException(40400, "Page not found");
        return page;
    }

    @Transactional
    public KnowledgePage getAndTouch(String id) {
        KnowledgePage page = kbRepo.selectById(id);
        if (page == null) throw new BusinessException(40400, "Page not found");
        // Track last access without touching updated_at
        page.setLastAccessedAt(java.time.Instant.now());
        kbRepo.touchLastAccessed(id, page.getLastAccessedAt());
        return page;
    }

    @Transactional
    public KnowledgePage create(String projectId, CreatePageRequest req) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();
        projectService.verifyProjectActive(projectId);

        KnowledgePage page = new KnowledgePage();
        page.setTenantId(tenantId);
        page.setProjectId(projectId);
        page.setTitle(req.title());
        page.setContent(req.content() != null ? req.content() : "");
        page.setCategory(req.category() != null ? req.category() : "general");
        page.setStatus(req.status() != null ? req.status() : "published");
        page.setIsSample(req.isSample() != null ? req.isSample() : false);
        page.setCreatedBy(userId);
        page.setUpdatedBy(userId);
        kbRepo.insert(page);

        // Trigger embedding generation for wiki page content
        eventPublisher.publishEvent(EmbeddingEvent.wikiPageCreated(
            tenantId, projectId, page.getId(), page.getTitle(), page.getContent()));

        return page;
    }

    @Transactional
    public KnowledgePage update(String id, UpdatePageRequest req) {
        KnowledgePage page = kbRepo.selectById(id);
        if (page == null) throw new BusinessException(40400, "Page not found");
        projectService.verifyProjectActive(page.getProjectId());

        // Auto-transition from sample to regular when user edits content or title
        if (Boolean.TRUE.equals(page.getIsSample())) {
            if ((req.title() != null && !req.title().equals(page.getTitle()))
                || (req.content() != null && !req.content().equals(page.getContent()))) {
                page.setIsSample(false);
            }
        }

        if (req.title() != null) page.setTitle(req.title());
        if (req.content() != null) page.setContent(req.content());
        if (req.category() != null) page.setCategory(req.category());
        if (req.status() != null) page.setStatus(req.status());
        page.setUpdatedBy(TenantContextHolder.getUserId());
        kbRepo.updateById(page);

        // Trigger embedding regeneration when content changes
        if (req.content() != null || req.title() != null) {
            eventPublisher.publishEvent(EmbeddingEvent.wikiPageUpdated(
                TenantContextHolder.getTenantId(), page.getProjectId(), id,
                page.getTitle(), page.getContent()));
        }

        return page;
    }

    @Transactional
    public void delete(String id) {
        KnowledgePage page = kbRepo.selectById(id);
        if (page == null) throw new BusinessException(40400, "Page not found");
        projectService.verifyProjectActive(page.getProjectId());
        kbRepo.deleteById(id);
    }

    /** Batch create wiki pages — used by wiki template initialization. */
    @Transactional
    public void batchCreate(String projectId, List<CreatePageRequest> pages) {
        String tenantId = TenantContextHolder.getTenantId();
        String userId = TenantContextHolder.getUserId();

        for (CreatePageRequest req : pages) {
            KnowledgePage page = new KnowledgePage();
            page.setTenantId(tenantId);
            page.setProjectId(projectId);
            page.setTitle(req.title());
            page.setContent(req.content() != null ? req.content() : "");
            page.setCategory(req.category() != null ? req.category() : "general");
            page.setStatus(req.status() != null ? req.status() : "draft");
            page.setIsSample(req.isSample() != null ? req.isSample() : true);
            page.setCreatedBy(userId);
            page.setUpdatedBy(userId);
            kbRepo.insert(page);
        }
    }
}
