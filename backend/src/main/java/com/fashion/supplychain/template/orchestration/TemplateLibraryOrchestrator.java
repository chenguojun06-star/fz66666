package com.fashion.supplychain.template.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.helper.TemplateMutationHelper;
import com.fashion.supplychain.template.helper.TemplatePriceSyncHelper;
import com.fashion.supplychain.template.helper.TemplateQueryHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class TemplateLibraryOrchestrator {

    @Autowired private TemplateQueryHelper templateQueryHelper;
    @Autowired private TemplateMutationHelper templateMutationHelper;
    @Autowired private TemplatePriceSyncHelper templatePriceSyncHelper;

    // ── Query ──

    public IPage<TemplateLibrary> list(Map<String, Object> params) {
        return templateQueryHelper.list(params);
    }

    public List<TemplateLibrary> listByType(String templateType) {
        return templateQueryHelper.listByType(templateType);
    }

    public TemplateLibrary detail(String id) {
        return templateQueryHelper.detail(id);
    }

    public Map<String, BigDecimal> resolveProcessUnitPrices(String styleNo) {
        return templateQueryHelper.resolveProcessUnitPrices(styleNo);
    }

    public List<Map<String, Object>> resolveProgressNodeUnitPrices(String styleNo) {
        return templateQueryHelper.resolveProgressNodeUnitPrices(styleNo);
    }

    public Map<String, Object> getProcessPriceTemplate(String styleNo) {
        return templateQueryHelper.getProcessPriceTemplate(styleNo);
    }

    public List<Map<String, Object>> listProcessPriceStyleOptions(String keyword) {
        return templateQueryHelper.listProcessPriceStyleOptions(keyword);
    }

    public List<Map<String, Object>> listSyncCandidateOrders(String styleNo) {
        return templateQueryHelper.listSyncCandidateOrders(styleNo);
    }

    // ── Mutations ──

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> saveProcessPriceTemplate(Map<String, Object> body) {
        return templateMutationHelper.saveProcessPriceTemplate(body);
    }

    public TemplateLibrary create(TemplateLibrary tpl) {
        return templateMutationHelper.create(tpl);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(TemplateLibrary tpl) {
        return templateMutationHelper.save(tpl);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(TemplateLibrary tpl) {
        return templateMutationHelper.update(tpl);
    }

    public boolean lockTemplate(String id) {
        return templateMutationHelper.lockTemplate(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean rollback(String id, String reason) {
        return templateMutationHelper.rollback(id, reason);
    }

    public boolean delete(String id) {
        return templateMutationHelper.delete(id);
    }

    public List<TemplateLibrary> createFromStyle(Map<String, Object> body) {
        return templateMutationHelper.createFromStyle(body);
    }

    public boolean applyToStyle(Map<String, Object> body) {
        return templateMutationHelper.applyToStyle(body);
    }

    // ── Price Sync ──

    public Map<String, Object> syncProcessUnitPricesByStyleNo(String styleNo) {
        return templatePriceSyncHelper.syncProcessUnitPricesByStyleNo(styleNo);
    }

    public Map<String, Object> syncProcessUnitPricesByStyleNo(String styleNo, List<String> orderIds) {
        return templatePriceSyncHelper.syncProcessUnitPricesByStyleNo(styleNo, orderIds);
    }
}
