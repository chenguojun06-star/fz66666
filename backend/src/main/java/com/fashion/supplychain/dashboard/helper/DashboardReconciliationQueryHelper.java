package com.fashion.supplychain.dashboard.helper;

import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class DashboardReconciliationQueryHelper {

    private final MaterialReconciliationService materialReconciliationService;
    private final ShipmentReconciliationService shipmentReconciliationService;

    public DashboardReconciliationQueryHelper(
            MaterialReconciliationService materialReconciliationService,
            ShipmentReconciliationService shipmentReconciliationService) {
        this.materialReconciliationService = materialReconciliationService;
        this.shipmentReconciliationService = shipmentReconciliationService;
    }

    public long countPendingMaterialReconciliations() {
        return materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(MaterialReconciliation::getStatus, "pending")
                .count();
    }

    public long countPendingShipmentReconciliations() {
        return shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getStatus, "pending")
                .count();
    }

    public long countApprovedMaterialReconciliations() {
        return materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(MaterialReconciliation::getStatus, "approved")
                .count();
    }

    public long countApprovedShipmentReconciliations() {
        return shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getStatus, "approved")
                .count();
    }
}
