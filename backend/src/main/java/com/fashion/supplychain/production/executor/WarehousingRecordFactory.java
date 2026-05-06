package com.fashion.supplychain.production.executor;

import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class WarehousingRecordFactory {

    public ProductWarehousing createScanWarehousingRecord(ProductionOrder order, int quantity,
                                                          String warehouse, String qrCode,
                                                          String operatorId, String operatorName,
                                                          String scanMode) {
        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setWarehousingType("scan");
        w.setWarehouse(warehouse);
        w.setWarehousingQuantity(quantity);
        w.setQualifiedQuantity(quantity);
        w.setUnqualifiedQuantity(0);
        w.setQualityStatus("qualified");
        w.setCuttingBundleQrCode(qrCode);
        if (StringUtils.hasText(scanMode)) {
            w.setScanMode(scanMode);
        }
        if (StringUtils.hasText(operatorId)) {
            w.setWarehousingOperatorId(operatorId);
            w.setReceiverId(operatorId);
            w.setQualityOperatorId(operatorId);
        }
        if (StringUtils.hasText(operatorName)) {
            w.setWarehousingOperatorName(operatorName);
            w.setReceiverName(operatorName);
            w.setQualityOperatorName(operatorName);
        }
        w.setTenantId(order.getTenantId());
        return w;
    }
}
