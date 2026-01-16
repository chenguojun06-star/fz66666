package com.fashion.supplychain.dashboard.service;

import com.fashion.supplychain.finance.entity.FactoryReconciliation;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.time.LocalDateTime;
import java.util.List;

public interface DashboardQueryService {

    long countEnabledStyles();

    long countProductionOrders();

    long countPendingFactoryReconciliations();

    long countPendingMaterialReconciliations();

    long countPendingShipmentReconciliations();

    long countApprovedFactoryReconciliations();

    long countApprovedMaterialReconciliations();

    long countApprovedShipmentReconciliations();

    long countScansBetween(LocalDateTime start, LocalDateTime end);

    long countWarehousingBetween(LocalDateTime start, LocalDateTime end);

    long sumUnqualifiedQuantityBetween(LocalDateTime start, LocalDateTime end);

    long countUrgentEvents();

    List<StyleInfo> listRecentStyles(int limit);

    List<ProductionOrder> listRecentOrders(int limit);

    List<FactoryReconciliation> listRecentFactoryReconciliations(int limit);

    List<ScanRecord> listRecentScans(int limit);

    List<MaterialPurchase> listRecentPurchases(int limit);
}
