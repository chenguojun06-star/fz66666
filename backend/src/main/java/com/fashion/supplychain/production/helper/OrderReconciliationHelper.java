package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.production.entity.ProductionOrder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 订单结算辅助类
 *
 * <p>关单结算创建已收敛至 ShipmentReconciliationOrchestrator.ensureShipmentReconciliationForOrder
 * 统一链路，原 createShipmentReconciliationOnClose 为无调用方的死代码且在 Helper 层
 * 挂 @Transactional（违反 D-001 事务边界铁律），已删除。</p>
 *
 * <p>本类仅保留本厂/外发工厂判定，供对账链路复用。</p>
 */
@Component
public class OrderReconciliationHelper {

    public boolean isOwnFactory(ProductionOrder order) {
        if (order == null) {
            return false;
        }
        if (StringUtils.hasText(order.getFactoryType())) {
            return "INTERNAL".equalsIgnoreCase(order.getFactoryType().trim());
        }
        String factoryName = order.getFactoryName();
        if (!StringUtils.hasText(factoryName)) {
            return false;
        }
        String name = factoryName.trim();
        return "本厂".equals(name) || "最美服装工厂".equals(name);
    }
}
