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
        return createScanWarehousingRecord(order, quantity, warehouse, null, null, qrCode, operatorId, operatorName, scanMode);
    }

    public ProductWarehousing createScanWarehousingRecord(ProductionOrder order, int quantity,
                                                          String warehouse, String warehouseAreaId, String warehouseAreaName,
                                                          String qrCode, String operatorId, String operatorName,
                                                          String scanMode) {
        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setWarehousingType("scan");
        w.setWarehouse(warehouse);
        if (StringUtils.hasText(warehouseAreaId)) {
            w.setWarehouseAreaId(warehouseAreaId);
        }
        if (StringUtils.hasText(warehouseAreaName)) {
            w.setWarehouseAreaName(warehouseAreaName);
        }
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
