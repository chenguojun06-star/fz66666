package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;

import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class ScanRecordPermissionHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    public void assertUndoRecordPermission(ScanRecord target) {
        if (target == null) {
            return;
        }
        Long currentTenantId = UserContext.tenantId();
        Long recordTenantId = target.getTenantId();
        if (currentTenantId != null && recordTenantId != null && !currentTenantId.equals(recordTenantId)) {
            throw new AccessDeniedException("无权撤回该扫码记录");
        }

        String factoryId = UserContext.factoryId();
        if (!StringUtils.hasText(factoryId)) {
            return;
        }

        String orderId = TextUtils.safeText(target.getOrderId());
        String orderNo = TextUtils.safeText(target.getOrderNo());
        ProductionOrder order = findScopedOrder(orderId, orderNo);
        if (order == null || !factoryId.equals(order.getFactoryId())) {
            throw new AccessDeniedException("该扫码记录不属于您的工厂，无权撤回");
        }
    }

    public ProductionOrder findScopedOrder(String orderId, String orderNo) {
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();

        LambdaQueryWrapper<ProductionOrder> qw = new LambdaQueryWrapper<>();
        qw.select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getTenantId,
                        ProductionOrder::getFactoryId, ProductionOrder::getStatus)
                .eq(ProductionOrder::getTenantId, tenantId)
                .last("LIMIT 1");

        boolean hasOrderId = StringUtils.hasText(orderId);
        boolean hasOrderNo = StringUtils.hasText(orderNo);
        if (hasOrderId && hasOrderNo) {
            qw.and(w -> w.eq(ProductionOrder::getId, orderId.trim())
                    .or()
                    .eq(ProductionOrder::getOrderNo, orderNo.trim()));
        } else if (hasOrderId) {
            qw.eq(ProductionOrder::getId, orderId.trim());
        } else if (hasOrderNo) {
            qw.eq(ProductionOrder::getOrderNo, orderNo.trim());
        } else {
            return null;
        }

        if (StringUtils.hasText(factoryId)) {
            qw.eq(ProductionOrder::getFactoryId, factoryId);
        }
        return productionOrderService.getOne(qw, false);
    }

    private static final Set<String> TERMINAL_STATUSES =
            Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    public boolean isTerminalOrderStatus(String status) {
        if (status == null) {
            return false;
        }
        return TERMINAL_STATUSES.contains(status.trim().toLowerCase());
    }
}
