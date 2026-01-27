package com.fashion.supplychain.dashboard.service;

import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.time.LocalDateTime;
import java.util.List;

public interface DashboardQueryService {

    long countEnabledStyles();

    long countProductionOrders();

    long countPendingMaterialReconciliations();

    long countPendingShipmentReconciliations();

    long countApprovedMaterialReconciliations();

    long countApprovedShipmentReconciliations();

    long countScansBetween(LocalDateTime start, LocalDateTime end);

    long countWarehousingBetween(LocalDateTime start, LocalDateTime end);

    long countUrgentEvents();

    List<StyleInfo> listRecentStyles(int limit);

    List<ProductionOrder> listRecentOrders(int limit);

    List<ScanRecord> listRecentScans(int limit);

    List<MaterialPurchase> listRecentPurchases(int limit);

    // 新增方法
    long sumTotalOrderQuantity();

    long countOverdueOrders();

    long countTotalWarehousing();

    List<ProductionOrder> listOverdueOrders(int limit);

    // 质检统计方法
    long sumTotalQualifiedQuantity();

    long sumTotalUnqualifiedQuantity();

    long countRepairIssues();

    // 带时间范围的质检统计方法
    long sumQualifiedQuantityBetween(LocalDateTime start, LocalDateTime end);

    long sumUnqualifiedQuantityBetween(LocalDateTime start, LocalDateTime end);

    long countRepairIssuesBetween(LocalDateTime start, LocalDateTime end);

    // 顶部统计看板方法
    long countSampleStylesBetween(LocalDateTime start, LocalDateTime end);

    long countProductionOrdersBetween(LocalDateTime start, LocalDateTime end);

    long sumCuttingQuantityBetween(LocalDateTime start, LocalDateTime end);

    long sumWarehousingQuantityBetween(LocalDateTime start, LocalDateTime end);
}
