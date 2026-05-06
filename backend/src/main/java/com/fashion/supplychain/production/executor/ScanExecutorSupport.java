package com.fashion.supplychain.production.executor;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

@Component
@Slf4j
public class ScanExecutorSupport {

    @Autowired
    private ProductionOrderService productionOrderService;

    public void validateBundleFactoryAccess(CuttingBundle bundle, String stageName) {
        if (bundle == null) return;
        String bundleFactoryId = bundle.getFactoryId();
        if (!StringUtils.hasText(bundleFactoryId)) return;
        String workerFactoryId = UserContext.factoryId();
        if (!bundleFactoryId.equals(workerFactoryId)) {
            log.warn("[工厂隔离-{}] 扫码被拒绝: bundleId={}, bundleFactory={}, workerFactory={}",
                    stageName, bundle.getId(), bundleFactoryId, workerFactoryId);
            throw new BusinessException("该菲号已转派至外发工厂，您无权" + stageName + "扫码");
        }
    }

    public void validateOrderNotTerminal(ProductionOrder order, String stageName) {
        String status = order.getStatus() == null ? "" : order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(status)) {
            throw new IllegalStateException("订单已终态(" + status + ")，无法继续" + stageName);
        }
    }

    public void recomputeProgressSync(String orderId) {
        try {
            if (productionOrderService != null) {
                productionOrderService.recomputeProgressFromRecords(orderId);
            }
        } catch (Exception e) {
            log.warn("订单进度同步重算失败(不阻断): orderId={}", orderId, e);
        }
    }

    public void recomputeProgressAsync(String orderId) {
        try {
            if (productionOrderService != null) {
                productionOrderService.recomputeProgressAsync(orderId);
            }
        } catch (Exception e) {
            log.warn("订单进度异步重算失败(不阻断): orderId={}", orderId, e);
        }
    }

    public Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());
        return info;
    }

    public static boolean hasText(String str) {
        return StringUtils.hasText(str);
    }
}
