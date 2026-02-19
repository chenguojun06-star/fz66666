package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class StyleProcessOrchestrator {

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    @Autowired
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    public List<StyleProcess> listByStyleId(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        return styleProcessService.listByStyleId(styleId);
    }

    public boolean save(StyleProcess styleProcess) {
        if (styleProcess == null || styleProcess.getStyleId() == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        // 移除纸样状态检查，工序单价是独立模块
        // if (styleInfoService.isPatternLocked(styleProcess.getStyleId())) {
        //     throw new IllegalStateException("纸样已完成，无法修改，请先回退");
        // }
        if (styleProcess.getCreateTime() == null) {
            styleProcess.setCreateTime(LocalDateTime.now());
        }
        styleProcess.setUpdateTime(LocalDateTime.now());
        boolean ok = styleProcessService.save(styleProcess);
        // 样衣阶段不自动同步到模板库
        // if (ok) {
        //     tryCreateProcessTemplates(styleProcess.getStyleId());
        // }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // 工序变更后自动重算报价单
        try {
            styleQuotationOrchestrator.recalculateFromLiveData(styleProcess.getStyleId());
        } catch (Exception e) {
            log.warn("Auto-sync quotation failed after process save: styleId={}, error={}", styleProcess.getStyleId(), e.getMessage());
        }

        return true;
    }

    public boolean update(StyleProcess styleProcess) {
        if (styleProcess == null || styleProcess.getId() == null) {
            throw new IllegalArgumentException("id不能为空");
        }
        StyleProcess current = styleProcessService.getById(styleProcess.getId());
        if (current == null) {
            throw new NoSuchElementException("记录不存在");
        }
        // 移除纸样状态检查，工序单价是独立模块
        // if (styleInfoService.isPatternLocked(current.getStyleId())) {
        //     throw new IllegalStateException("纸样已完成，无法修改，请先回退");
        // }
        styleProcess.setStyleId(current.getStyleId());
        styleProcess.setUpdateTime(LocalDateTime.now());
        boolean ok = styleProcessService.updateById(styleProcess);
        // 样衣阶段不自动同步到模板库
        // if (ok) {
        //     tryCreateProcessTemplates(current.getStyleId());
        // }
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

    public boolean delete(String id) {
        StyleProcess current = styleProcessService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("记录不存在");
        }
        // 移除纸样状态检查，工序单价是独立模块
        // if (styleInfoService.isPatternLocked(current.getStyleId())) {
        //     throw new IllegalStateException("纸样已完成，无法修改，请先回退");
        // }
        boolean ok = styleProcessService.removeById(id);
        if (!ok) {
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

    private void tryCreateProcessTemplates(Long styleId) {
        try {
            StyleInfo style = styleId == null ? null : styleInfoService.getById(styleId);
            String styleNo = style == null ? null : style.getStyleNo();
            if (styleNo != null && !styleNo.trim().isEmpty()) {
                Map<String, Object> body = new HashMap<>();
                body.put("sourceStyleNo", styleNo.trim());
                body.put("templateTypes", List.of("process", "process_price", "progress"));
                templateLibraryOrchestrator.createFromStyle(body);
            }
        } catch (Exception e) {
            log.warn("Failed to sync templates from style process: styleId={}", styleId, e);
        }
    }
}
