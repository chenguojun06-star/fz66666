package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderLearningRefreshOrchestrator {

    private final ProductionOrderService productionOrderService;
    private final OrderDecisionCaptureOrchestrator orderDecisionCaptureOrchestrator;
    private final OrderLearningOutcomeOrchestrator orderLearningOutcomeOrchestrator;

    public int refreshRecentOrdersForCurrentTenant(int limit) {
        List<ProductionOrder> orders = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getTenantId, UserContext.tenantId())
                .orderByDesc(ProductionOrder::getUpdateTime)
                .last("limit " + Math.max(limit, 1)));
        return refreshOrders(orders);
    }

    public int refreshStyleOrdersForCurrentTenant(String styleNo, int limit) {
        if (!StringUtils.hasText(styleNo)) {
            return 0;
        }
        List<ProductionOrder> orders = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getTenantId, UserContext.tenantId())
                .eq(ProductionOrder::getStyleNo, styleNo.trim())
                .orderByDesc(ProductionOrder::getUpdateTime)
                .last("limit " + Math.max(limit, 1)));
        return refreshOrders(orders);
    }

    public int refreshRecentOrdersForTenant(Long tenantId, int limit) {
        if (tenantId == null) {
            return 0;
        }
        List<ProductionOrder> orders = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getTenantId, tenantId)
                .orderByDesc(ProductionOrder::getUpdateTime)
                .last("limit " + Math.max(limit, 1)));
        return refreshOrders(orders);
    }

    public int refreshOrders(List<ProductionOrder> orders) {
        int refreshed = 0;
        for (ProductionOrder order : orders) {
            try {
                orderDecisionCaptureOrchestrator.capture(order);
                orderLearningOutcomeOrchestrator.refreshByOrderId(order.getId());
                refreshed++;
            } catch (Exception ex) {
                log.warn("refresh order learning failed, orderId={}", order == null ? null : order.getId(), ex);
            }
        }
        return refreshed;
    }
}
