package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcPurchaseSuggestion;
import com.fashion.supplychain.integration.ecommerce.service.EcPurchaseSuggestionService;
import com.fashion.supplychain.integration.ecommerce.service.EcStockAlertService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcPurchaseSuggestionOrchestrator {

    @Autowired
    private EcPurchaseSuggestionService purchaseSuggestionService;

    @Autowired
    private EcStockAlertService stockAlertService;

    @Autowired
    private ProductSkuService productSkuService;

    @Transactional(rollbackFor = Exception.class)
    public void approveAndConvert(Long tenantId, Long suggestionId) {
        TenantAssert.requireTenantId();
        EcPurchaseSuggestion suggestion = purchaseSuggestionService.getById(suggestionId);
        if (suggestion == null || !suggestion.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("采购建议不存在或无权操作");
        }

        // 填充 skuCode，如果缺失
        if (suggestion.getSkuCode() == null && suggestion.getSkuId() != null) {
            ProductSku sku = productSkuService.getById(suggestion.getSkuId());
            if (sku != null) {
                suggestion.setSkuCode(sku.getSkuCode());
            }
        }

        suggestion.setStatus(1);
        purchaseSuggestionService.updateById(suggestion);
        log.info("[EcPurchaseSuggestionOrchestrator] 采购建议已审批: id={}, skuCode={}, qty={}",
                suggestionId, suggestion.getSkuCode(), suggestion.getSuggestQuantity());
    }

    @Transactional(rollbackFor = Exception.class)
    public void rejectSuggestion(Long tenantId, Long suggestionId) {
        TenantAssert.requireTenantId();
        EcPurchaseSuggestion suggestion = purchaseSuggestionService.getById(suggestionId);
        if (suggestion == null || !suggestion.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("采购建议不存在或无权操作");
        }
        suggestion.setStatus(2);
        purchaseSuggestionService.updateById(suggestion);
        log.info("[EcPurchaseSuggestionOrchestrator] 采购建议已拒绝: id={}", suggestionId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void resolveAlertWithSuggestion(Long tenantId, Long alertId) {
        TenantAssert.requireTenantId();
        stockAlertService.resolveAlert(tenantId, alertId);
        log.info("[EcPurchaseSuggestionOrchestrator] 预警已处理: alertId={}", alertId);
    }
}
