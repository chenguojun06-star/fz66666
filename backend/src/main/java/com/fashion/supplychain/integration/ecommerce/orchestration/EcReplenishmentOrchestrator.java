package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcPurchaseSuggestion;
import com.fashion.supplychain.integration.ecommerce.entity.EcStockAlert;
import com.fashion.supplychain.integration.ecommerce.service.EcPurchaseSuggestionService;
import com.fashion.supplychain.integration.ecommerce.service.EcStockAlertService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 补货建议编排器（Phase 1）
 *
 * <p>事务边界：所有"人工确认→执行"的多表写操作在此层加 @Transactional。
 * <p>核心方法：
 * <ul>
 *   <li>{@link #approveAndConvert} 人工确认建议 → 按类型转采购/转生产</li>
 *   <li>{@link #rejectSuggestion} 人工拒绝建议</li>
 *   <li>{@link #onProductionInbound} 生产入库回调 → 解除关联预警</li>
 * </ul>
 *
 * <p>设计原则：
 * <ol>
 *   <li>所有 AI 建议必须人工确认才执行（PENDING→APPROVED→执行）</li>
 *   <li>转生产时不强制要求样衣完成（电商补货场景允许直接生成生产单）</li>
 *   <li>入库后只解除预警，不自动发货（人工确认发货，与"建议人工确认"原则一致）</li>
 * </ol>
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcReplenishmentOrchestrator {

    @Autowired @Lazy private EcPurchaseSuggestionService suggestionService;
    @Autowired @Lazy private EcStockAlertService stockAlertService;
    @Autowired @Lazy private ProductionOrderService productionOrderService;
    @Autowired @Lazy private StyleInfoService styleInfoService;
    @Autowired @Lazy private SmartReplenishmentAdvisor advisor;

    /**
     * 人工确认建议 → 按类型转采购/转生产
     *
     * <p>事务保证：建议状态更新 + 生产订单创建 + 预警关联 原子化。
     */
    @Transactional(rollbackFor = Exception.class)
    public ApproveResult approveAndConvert(Long tenantId, Long suggestionId) {
        TenantAssert.requireTenantId();
        EcPurchaseSuggestion suggestion = suggestionService.getById(suggestionId);
        if (suggestion == null || !suggestion.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("补货建议不存在或无权操作");
        }
        if (suggestion.getStatus() != null && suggestion.getStatus() != 0) {
            throw new IllegalStateException("建议已处理，无法重复确认");
        }

        String type = suggestion.getSuggestionType();
        ApproveResult result = new ApproveResult();
        result.setSuggestionId(suggestionId);
        result.setSuggestionType(type);

        if (SmartReplenishmentAdvisor.TYPE_PRODUCTION.equals(type)) {
            String orderId = convertToProduction(tenantId, suggestion);
            suggestion.setStatus(1);
            suggestion.setProductionOrderId(parseLong(orderId));
            suggestionService.updateById(suggestion);
            result.setProductionOrderId(orderId);
            result.setMessage("已转生产订单: " + orderId);
        } else {
            // 采购类型：仅标记已确认，采购单创建走原有流程（PurchaseOrderService）
            suggestion.setStatus(1);
            suggestionService.updateById(suggestion);
            result.setMessage("已确认采购建议，请到采购管理创建采购单");
        }

        log.info("[EcReplenishment] 建议已确认 tenantId={} suggestionId={} type={} result={}",
                tenantId, suggestionId, type, result.getMessage());
        return result;
    }

    /**
     * 人工拒绝建议
     */
    @Transactional(rollbackFor = Exception.class)
    public void rejectSuggestion(Long tenantId, Long suggestionId) {
        TenantAssert.requireTenantId();
        EcPurchaseSuggestion suggestion = suggestionService.getById(suggestionId);
        if (suggestion == null || !suggestion.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("补货建议不存在或无权操作");
        }
        if (suggestion.getStatus() != null && suggestion.getStatus() != 0) {
            throw new IllegalStateException("建议已处理，无法重复操作");
        }
        suggestion.setStatus(2);
        suggestionService.updateById(suggestion);
        log.info("[EcReplenishment] 建议已拒绝 tenantId={} suggestionId={}", tenantId, suggestionId);
    }

    /**
     * 生产入库回调：解除关联的缺货预警
     *
     * <p>由 ProductionOrder 入库完成事件触发（不在此处自动发货，人工确认发货）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void onProductionInbound(Long tenantId, String productionOrderId) {
        TenantAssert.requireTenantId();
        // 查找该生产订单关联的建议
        EcPurchaseSuggestion suggestion = suggestionService.getOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<EcPurchaseSuggestion>()
                        .eq(EcPurchaseSuggestion::getTenantId, tenantId)
                        .eq(EcPurchaseSuggestion::getProductionOrderId, parseLong(productionOrderId))
                        .last("LIMIT 1"));
        if (suggestion == null) {
            return;
        }
        // 解除关联的缺货预警
        if (suggestion.getSkuId() != null) {
            java.util.List<EcStockAlert> alerts = stockAlertService.listUnresolved(tenantId);
            for (EcStockAlert alert : alerts) {
                if (suggestion.getSkuId().equals(alert.getSkuId())) {
                    stockAlertService.resolveAlert(tenantId, alert.getId());
                }
            }
        }
        log.info("[EcReplenishment] 生产入库回调已解除预警 tenantId={} productionOrderId={}",
                tenantId, productionOrderId);
    }

    /**
     * 触发 AI 补货顾问扫描（手动触发，对应前端"立即扫描"按钮）
     */
    public int triggerScan() {
        TenantAssert.assertTenantContext();
        return advisor.scanAndAdvise();
    }

    /** 转生产：创建最小化生产订单 */
    private String convertToProduction(Long tenantId, EcPurchaseSuggestion suggestion) {
        ProductionOrder order = new ProductionOrder();
        // 生成订单号：EC+日期+随机数
        String orderNo = "EC" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmm"))
                + String.format("%04d", ThreadLocalRandom.current().nextInt(10000));
        order.setOrderNo(orderNo);
        order.setStyleId(suggestion.getStyleId() != null ? String.valueOf(suggestion.getStyleId()) : null);
        order.setStyleNo(suggestion.getStyleNo());
        order.setSku(suggestion.getSkuCode());
        order.setOrderQuantity(suggestion.getSuggestQuantity());
        order.setStatus("pending");
        order.setProductionProgress(0);
        order.setMaterialArrivalRate(0);
        order.setTenantId(tenantId);

        // 同步款式信息
        if (suggestion.getStyleId() != null) {
            try {
                StyleInfo style = styleInfoService.getById(suggestion.getStyleId());
                if (style != null) {
                    order.setStyleName(style.getStyleName());
                    if (StringUtils.hasText(style.getSkc())) order.setSkc(style.getSkc());
                }
            } catch (Exception e) {
                log.warn("[EcReplenishment] 同步款式信息失败 styleId={}: {}", suggestion.getStyleId(), e.getMessage());
            }
        }

        // 创建人
        String currentUserId = UserContext.userId();
        String currentUsername = UserContext.username();
        if (StringUtils.hasText(currentUserId)) order.setCreatedById(currentUserId);
        if (StringUtils.hasText(currentUsername)) order.setCreatedByName(currentUsername);

        // 备注：来源 AI 补货建议
        String reason = suggestion.getAiReason() != null ? suggestion.getAiReason() : "电商缺货补货";
        order.setOrderDetails("【AI补货建议】" + reason + "；建议数量:" + suggestion.getSuggestQuantity());

        productionOrderService.save(order);
        log.info("[EcReplenishment] 已创建生产订单 orderNo={} styleNo={} qty={}",
                orderNo, suggestion.getStyleNo(), suggestion.getSuggestQuantity());
        return order.getId();
    }

    private Long parseLong(String s) {
        if (s == null || s.isEmpty()) return null;
        try { return Long.parseLong(s); } catch (NumberFormatException e) { return null; }
    }

    /** 确认结果 */
    @lombok.Data
    public static class ApproveResult {
        private Long suggestionId;
        private String suggestionType;
        private String productionOrderId;
        private String message;
    }
}
