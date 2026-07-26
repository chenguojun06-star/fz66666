package com.fashion.supplychain.dashboard.helper;

import com.fashion.supplychain.common.UserContext;
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

    /**
     * 待对账物料单数量
     * <p>
     * P0 修复（铁律4 多租户隔离）：必须按 tenant_id 过滤，防止跨租户统计
     */
    public long countPendingMaterialReconciliations() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return 0L;
        return materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getStatus, "pending")
                .count();
    }

    /**
     * 待对账出货单数量
     * <p>
     * P0 修复（铁律4 多租户隔离）：必须按 tenant_id 过滤，防止跨租户统计
     */
    public long countPendingShipmentReconciliations() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return 0L;
        return shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getTenantId, tenantId)
                .eq(ShipmentReconciliation::getStatus, "pending")
                .count();
    }

    /**
     * 已审核物料对账单数量
     * <p>
     * P0 修复（铁律4 多租户隔离）：必须按 tenant_id 过滤，防止跨租户统计
     */
    public long countApprovedMaterialReconciliations() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return 0L;
        return materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getStatus, "approved")
                .count();
    }

    /**
     * 已审核出货对账单数量
     * <p>
     * P0 修复（铁律4 多租户隔离）：必须按 tenant_id 过滤，防止跨租户统计
     */
    public long countApprovedShipmentReconciliations() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return 0L;
        return shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getTenantId, tenantId)
                .eq(ShipmentReconciliation::getStatus, "approved")
                .count();
    }
}
