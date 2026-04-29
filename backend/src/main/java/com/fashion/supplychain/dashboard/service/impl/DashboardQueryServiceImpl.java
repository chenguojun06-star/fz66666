package com.fashion.supplychain.dashboard.service.impl;

import com.fashion.supplychain.dashboard.helper.DashboardInventoryQueryHelper;
import com.fashion.supplychain.dashboard.helper.DashboardOrderQueryHelper;
import com.fashion.supplychain.dashboard.helper.DashboardReconciliationQueryHelper;
import com.fashion.supplychain.dashboard.helper.DashboardScanQueryHelper;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class DashboardQueryServiceImpl implements DashboardQueryService {

    private final DashboardOrderQueryHelper orderHelper;
    private final DashboardScanQueryHelper scanHelper;
    private final DashboardInventoryQueryHelper inventoryHelper;
    private final DashboardReconciliationQueryHelper reconciliationHelper;

    public DashboardQueryServiceImpl(
            DashboardOrderQueryHelper orderHelper,
            DashboardScanQueryHelper scanHelper,
            DashboardInventoryQueryHelper inventoryHelper,
            DashboardReconciliationQueryHelper reconciliationHelper) {
        this.orderHelper = orderHelper;
        this.scanHelper = scanHelper;
        this.inventoryHelper = inventoryHelper;
        this.reconciliationHelper = reconciliationHelper;
    }

    @Override
    public long countEnabledStyles() {
        return orderHelper.countEnabledStyles();
    }

    @Override
    public long countProductionOrders() {
        return orderHelper.countProductionOrders();
    }

    @Override
    public long countPendingMaterialReconciliations() {
        return reconciliationHelper.countPendingMaterialReconciliations();
    }

    @Override
    public long countPendingShipmentReconciliations() {
        return reconciliationHelper.countPendingShipmentReconciliations();
    }

    @Override
    public long countApprovedMaterialReconciliations() {
        return reconciliationHelper.countApprovedMaterialReconciliations();
    }

    @Override
    public long countApprovedShipmentReconciliations() {
        return reconciliationHelper.countApprovedShipmentReconciliations();
    }

    @Override
    public long countScansBetween(LocalDateTime start, LocalDateTime end) {
        return scanHelper.countScansBetween(start, end);
    }

    @Override
    public long countWarehousingBetween(LocalDateTime start, LocalDateTime end) {
        return inventoryHelper.countWarehousingBetween(start, end);
    }

    @Override
    public long sumUnqualifiedQuantityBetween(LocalDateTime start, LocalDateTime end) {
        return inventoryHelper.sumUnqualifiedQuantityBetween(start, end);
    }

    @Override
    public long countUrgentEvents() {
        return orderHelper.countUrgentEvents();
    }

    @Override
    public List<StyleInfo> listRecentStyles(int limit) {
        return orderHelper.listRecentStyles(limit);
    }

    @Override
    public List<ProductionOrder> listRecentOrders(int limit) {
        return orderHelper.listRecentOrders(limit);
    }

    @Override
    public List<ScanRecord> listRecentScans(int limit) {
        return scanHelper.listRecentScans(limit);
    }

    @Override
    public List<MaterialPurchase> listRecentPurchases(int limit) {
        return orderHelper.listRecentPurchases(limit);
    }

    @Override
    public long sumTotalOrderQuantity() {
        return orderHelper.sumTotalOrderQuantity();
    }

    @Override
    public long countOverdueOrders() {
        return orderHelper.countOverdueOrders();
    }

    @Override
    public long countTotalWarehousing() {
        return inventoryHelper.countTotalWarehousing();
    }

    @Override
    public List<ProductionOrder> listOverdueOrders(int limit) {
        return orderHelper.listOverdueOrders(limit);
    }

    @Override
    public long sumTotalQualifiedQuantity() {
        return inventoryHelper.sumTotalQualifiedQuantity();
    }

    @Override
    public long sumTotalUnqualifiedQuantity() {
        return inventoryHelper.sumTotalUnqualifiedQuantity();
    }

    @Override
    public long countRepairIssues() {
        return inventoryHelper.countRepairIssues();
    }

    @Override
    public long sumQualifiedQuantityBetween(LocalDateTime start, LocalDateTime end) {
        return inventoryHelper.sumQualifiedQuantityBetween(start, end);
    }

    @Override
    public long countRepairIssuesBetween(LocalDateTime start, LocalDateTime end) {
        return inventoryHelper.countRepairIssuesBetween(start, end);
    }

    @Override
    public long countSampleStylesBetween(LocalDateTime start, LocalDateTime end) {
        return orderHelper.countSampleStylesBetween(start, end);
    }

    @Override
    public long countProductionOrdersBetween(LocalDateTime start, LocalDateTime end) {
        return orderHelper.countProductionOrdersBetween(start, end);
    }

    @Override
    public long sumOrderQuantityBetween(LocalDateTime start, LocalDateTime end) {
        return orderHelper.sumOrderQuantityBetween(start, end);
    }

    @Override
    public long sumCuttingQuantityBetween(LocalDateTime start, LocalDateTime end) {
        return inventoryHelper.sumCuttingQuantityBetween(start, end);
    }

    @Override
    public long sumWarehousingQuantityBetween(LocalDateTime start, LocalDateTime end) {
        return inventoryHelper.sumWarehousingQuantityBetween(start, end);
    }

    @Override
    public long countOutstockBetween(LocalDateTime start, LocalDateTime end) {
        return inventoryHelper.countOutstockBetween(start, end);
    }

    @Override
    public long sumOutstockQuantityBetween(LocalDateTime start, LocalDateTime end) {
        return inventoryHelper.sumOutstockQuantityBetween(start, end);
    }

    @Override
    public List<Integer> getDailyOrderQuantities(LocalDateTime start, LocalDateTime end) {
        return orderHelper.getDailyOrderQuantities(start, end);
    }

    @Override
    public List<Integer> getDailyCuttingQuantities(LocalDateTime start, LocalDateTime end) {
        return inventoryHelper.getDailyCuttingQuantities(start, end);
    }

    @Override
    public List<Integer> getDailyScanCounts(LocalDateTime start, LocalDateTime end) {
        return scanHelper.getDailyScanCounts(start, end);
    }

    @Override
    public List<Integer> getDailyScanQuantities(LocalDateTime start, LocalDateTime end) {
        return scanHelper.getDailyScanQuantities(start, end);
    }

    @Override
    public List<ProductionOrder> listAllOverdueOrders() {
        return orderHelper.listAllOverdueOrders();
    }

    @Override
    public long sumTodayScanQuantity() {
        return scanHelper.sumTodayScanQuantity();
    }

    @Override
    public long sumTotalScanQuantity() {
        return scanHelper.sumTotalScanQuantity();
    }
}
