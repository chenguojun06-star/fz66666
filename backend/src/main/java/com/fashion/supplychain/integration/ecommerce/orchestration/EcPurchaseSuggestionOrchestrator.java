package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcPurchaseSuggestion;
import com.fashion.supplychain.integration.ecommerce.service.EcPurchaseSuggestionService;
import com.fashion.supplychain.integration.ecommerce.service.EcStockAlertService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 电商采购/补货建议编排器（只负责「拒绝」与「预警处理」两个轻动作）
 *
 * <p><b>注意：本类不负责「确认建议 → 转采购/转生产」。</b>
 * 该能力在 {@link EcReplenishmentOrchestrator#approveAndConvert}，因为转生产必须
 * 创建真实的 {@code ProductionOrder} 并回填 {@code productionOrderId}。
 *
 * <p>历史遗留：本类曾有一个同名的 {@code approveAndConvert}，只把建议状态改成「已审批」
 * 却不生成任何采购单/生产单（空壳语义），且没有任何调用方。为避免后续开发误用，
 * 已于 2026-09 删除，确认入口统一收敛到 {@link EcReplenishmentOrchestrator}。
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcPurchaseSuggestionOrchestrator {

    @Autowired
    private EcPurchaseSuggestionService purchaseSuggestionService;

    @Autowired
    private EcStockAlertService stockAlertService;

    @Transactional(rollbackFor = Exception.class)
    public void rejectSuggestion(Long tenantId, Long suggestionId) {
        TenantAssert.requireTenantId();
        EcPurchaseSuggestion suggestion = purchaseSuggestionService.getById(suggestionId);
        if (suggestion == null || !suggestion.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("采购建议不存在或无权操作");
        }
        if (suggestion.getStatus() != null && suggestion.getStatus() != 0) {
            throw new IllegalStateException("建议已处理，无法重复操作");
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
