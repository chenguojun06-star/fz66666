package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.PatternRevision;
import com.fashion.supplychain.production.service.PatternRevisionService;
import com.fashion.supplychain.style.orchestration.StyleInfoOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * 纸样改版编排器
 * <p>
 * 所有写操作（create / update / delete）都在此类中执行，
 * Controller 仅负责参数校验和返回包装。
 */
@Slf4j
@Service
public class PatternRevisionOrchestrator {

    @Autowired
    private PatternRevisionService patternRevisionService;

    @Autowired
    private StyleInfoOrchestrator styleInfoOrchestrator;

    /**
     * 创建纸样改版记录
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> create(PatternRevision revision) {
        if (!StringUtils.hasText(revision.getRevisionNo()) && StringUtils.hasText(revision.getStyleNo())) {
            String nextVersion = patternRevisionService.generateNextRevisionNo(revision.getStyleNo());
            revision.setRevisionNo(nextVersion);
        }

        if (!StringUtils.hasText(revision.getStatus())) {
            revision.setStatus("DRAFT");
        }

        boolean success = patternRevisionService.save(revision);
        if (!success) {
            throw new IllegalStateException("创建失败");
        }
        if (!StringUtils.hasText(revision.getStyleId())) {
            throw new IllegalArgumentException("缺少款式ID");
        }

        styleInfoOrchestrator.lockPatternRevision(Long.valueOf(revision.getStyleId()));

        Map<String, Object> result = new HashMap<>();
        result.put("revision", revision);
        result.put("styleId", revision.getStyleId());
        result.put("styleNo", revision.getStyleNo());
        result.put("patternRevLocked", 1);
        return result;
    }

    /**
     * 更新纸样改版记录
     */
    @Transactional(rollbackFor = Exception.class)
    public PatternRevision update(String id, PatternRevision revision) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        PatternRevision existing = patternRevisionService.lambdaQuery()
                .eq(PatternRevision::getId, id)
                .eq(PatternRevision::getTenantId, tenantId)
                .one();
        if (existing == null) {
            throw new IllegalArgumentException("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existing.getTenantId(), "纸样改版记录");

        if (!"DRAFT".equals(existing.getStatus())) {
            throw new IllegalStateException("只有草稿状态才能修改");
        }

        revision.setId(id);
        boolean success = patternRevisionService.updateById(revision);
        if (!success) {
            throw new IllegalStateException("更新失败");
        }
        return revision;
    }

    /**
     * 删除纸样改版记录
     */
    @Transactional(rollbackFor = Exception.class)
    public void delete(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        PatternRevision existing = patternRevisionService.lambdaQuery()
                .eq(PatternRevision::getId, id)
                .eq(PatternRevision::getTenantId, tenantId)
                .one();
        if (existing == null) {
            throw new IllegalArgumentException("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existing.getTenantId(), "纸样改版记录");

        if (!"DRAFT".equals(existing.getStatus())) {
            throw new IllegalStateException("只有草稿状态才能删除");
        }

        boolean success = patternRevisionService.removeById(id);
        if (!success) {
            throw new IllegalStateException("删除失败");
        }
    }
}
