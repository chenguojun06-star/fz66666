package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleProcessService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
public class StyleProcessOrchestrator {

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    @Autowired
    private com.fashion.supplychain.style.helper.StyleStageCompletionHelper styleStageCompletionHelper;

    public List<StyleProcess> listByStyleId(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        return styleProcessService.listByStyleId(styleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(StyleProcess styleProcess) {
        if (styleProcess == null || styleProcess.getStyleId() == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        TenantAssert.assertTenantContext();
        if (styleProcess.getCreateTime() == null) {
            styleProcess.setCreateTime(LocalDateTime.now());
        }
        styleProcess.setUpdateTime(LocalDateTime.now());
        boolean ok = styleProcessService.save(styleProcess);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // 自动回填工序开始时间（用户跳过"开始工序单价"按钮直接添加数据时）
        styleStageCompletionHelper.autoStartStage(styleProcess.getStyleId(), "process");

        // 工序变更后自动重算报价单
        try {
            styleQuotationOrchestrator.recalculateFromLiveData(styleProcess.getStyleId());
        } catch (Exception e) {
            log.warn("Auto-sync quotation failed after process save: styleId={}, error={}", styleProcess.getStyleId(), e.getMessage());
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(StyleProcess styleProcess) {
        if (styleProcess == null || styleProcess.getId() == null) {
            throw new IllegalArgumentException("id不能为空");
        }
        StyleProcess current = styleProcessService.getById(styleProcess.getId());
        if (current == null) {
            throw new NoSuchElementException("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "工序");
        styleProcess.setStyleId(current.getStyleId());
        styleProcess.setUpdateTime(LocalDateTime.now());
        boolean ok = styleProcessService.updateById(styleProcess);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // 工序变更后自动重算报价单
        try {
            styleQuotationOrchestrator.recalculateFromLiveData(current.getStyleId());
        } catch (Exception e) {
            log.warn("Auto-sync quotation failed after process update: styleId={}, error={}", current.getStyleId(), e.getMessage());
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        StyleProcess current = styleProcessService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "工序");
        boolean ok = styleProcessService.removeById(id);
        if (!ok) {
            if (styleProcessService.getById(id) == null) {
                log.warn("[PROCESS-DELETE] id={} already deleted, idempotent success", id);
                return true;
            }
            throw new IllegalStateException("删除失败");
        }

        // 工序删除后自动重算报价单
        try {
            styleQuotationOrchestrator.recalculateFromLiveData(current.getStyleId());
        } catch (Exception e) {
            log.warn("Auto-sync quotation failed after process delete: styleId={}, error={}", current.getStyleId(), e.getMessage());
        }

        return true;
    }
}
