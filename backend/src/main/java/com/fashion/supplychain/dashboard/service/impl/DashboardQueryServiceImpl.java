package com.fashion.supplychain.dashboard.service.impl;

import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class DashboardQueryServiceImpl implements DashboardQueryService {

    private final StyleInfoService styleInfoService;
    private final ProductionOrderService productionOrderService;
    private final MaterialReconciliationService materialReconciliationService;
    private final ShipmentReconciliationService shipmentReconciliationService;
    private final ScanRecordService scanRecordService;
    private final MaterialPurchaseService materialPurchaseService;
    private final ProductWarehousingService productWarehousingService;
    private final ProductWarehousingMapper productWarehousingMapper;

    public DashboardQueryServiceImpl(
            StyleInfoService styleInfoService,
            ProductionOrderService productionOrderService,
            MaterialReconciliationService materialReconciliationService,
            ShipmentReconciliationService shipmentReconciliationService,
            ScanRecordService scanRecordService,
            MaterialPurchaseService materialPurchaseService,
            ProductWarehousingService productWarehousingService,
            ProductWarehousingMapper productWarehousingMapper) {
        this.styleInfoService = styleInfoService;
        this.productionOrderService = productionOrderService;
        this.materialReconciliationService = materialReconciliationService;
        this.shipmentReconciliationService = shipmentReconciliationService;
        this.scanRecordService = scanRecordService;
        this.materialPurchaseService = materialPurchaseService;
        this.productWarehousingService = productWarehousingService;
        this.productWarehousingMapper = productWarehousingMapper;
    }

    @Override
    public long countEnabledStyles() {
        return styleInfoService.lambdaQuery().eq(StyleInfo::getStatus, "ENABLED").count();
    }

    @Override
    public long countProductionOrders() {
        // 统计所有未删除的订单（包括待生产、生产中等状态）
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .in(ProductionOrder::getStatus, "pending", "production", "delayed")
                .count();
    }

    @Override
    public long countPendingMaterialReconciliations() {
        return materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(MaterialReconciliation::getStatus, "pending")
                .count();
    }

    @Override
    public long countPendingShipmentReconciliations() {
        return shipmentReconciliationService.lambdaQuery().eq(ShipmentReconciliation::getStatus, "pending").count();
    }

    @Override
    public long countApprovedMaterialReconciliations() {
        return materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(MaterialReconciliation::getStatus, "approved")
                .count();
    }

    @Override
    public long countApprovedShipmentReconciliations() {
        return shipmentReconciliationService.lambdaQuery().eq(ShipmentReconciliation::getStatus, "approved").count();
    }

    @Override
    public long countScansBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        return scanRecordService.lambdaQuery().between(ScanRecord::getScanTime, start, end).count();
    }

    @Override
    public long countWarehousingBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .between(ProductWarehousing::getCreateTime, start, end)
                .count();
    }

    @Override
    public long sumUnqualifiedQuantityBetween(LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(unqualified_quantity), 0) as total")
                .eq("delete_flag", 0)
                .ge(start != null, "create_time", start)
                .le(end != null, "create_time", end);
        List<Map<String, Object>> rows = productWarehousingMapper.selectMaps(qw);
        Map<String, Object> first = (rows == null || rows.isEmpty()) ? null : rows.getFirst();
        Object v = first == null ? null : (first.get("total") == null ? first.get("TOTAL") : first.get("total"));
        if (v == null) {
            return 0;
        }
        if (v instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (Exception e) {
            return 0;
        }
    }

    @Override
    public long countUrgentEvents() {
        LocalDateTime now = LocalDateTime.now();

        // 1. 订单超期：已超过计划结束日期但未完成的订单
        long delayedOrders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ne(ProductionOrder::getStatus, "已完成")
                .ne(ProductionOrder::getStatus, "已取消")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .count();

        // 2. 面料采购待处理：状态为pending的采购单
        long pendingPurchases = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getStatus, "pending")
                .count();

        // 3. 未来可扩展：质检超期、对账超期等
        // long overdueQualityCheck = ...;
        // long overdueReconciliation = ...;

        return delayedOrders + pendingPurchases;
    }

    @Override
    public List<StyleInfo> listRecentStyles(int limit) {
        int lim = Math.max(1, limit);
        return styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStatus, "ENABLED")
                .orderByDesc(StyleInfo::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public List<ProductionOrder> listRecentOrders(int limit) {
        int lim = Math.max(1, limit);
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .orderByDesc(ProductionOrder::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public List<ScanRecord> listRecentScans(int limit) {
        int lim = Math.max(1, limit);
        return scanRecordService.lambdaQuery()
                .orderByDesc(ScanRecord::getScanTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public List<MaterialPurchase> listRecentPurchases(int limit) {
        int lim = Math.max(1, limit);
        return materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .orderByDesc(MaterialPurchase::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public long sumTotalOrderQuantity() {
        // 计算所有生产订单的总数量
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .select(ProductionOrder::getOrderQuantity)
                .list();
        return orders.stream()
                .mapToLong(order -> order.getOrderQuantity() != null ? order.getOrderQuantity() : 0L)
                .sum();
    }

    @Override
    public long countOverdueOrders() {
        // 计算延期订单：计划结束日期已过但状态不是已完成的订单
        LocalDateTime now = LocalDateTime.now();
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ne(ProductionOrder::getStatus, "completed")
                .ne(ProductionOrder::getStatus, "cancelled")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .count();
    }

    @Override
    public long countTotalWarehousing() {
        // 统计所有入库记录的总数
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .count();
    }

    @Override
    public List<ProductionOrder> listOverdueOrders(int limit) {
        // 获取延期订单列表
        int lim = Math.max(1, limit);
        LocalDateTime now = LocalDateTime.now();
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ne(ProductionOrder::getStatus, "completed")
                .ne(ProductionOrder::getStatus, "cancelled")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .orderBy(true, true, ProductionOrder::getPlannedEndDate)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public long sumTotalQualifiedQuantity() {
        // 统计所有合格品数量
        List<ProductWarehousing> warehouses = productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .select(ProductWarehousing::getQualifiedQuantity)
                .list();
        return warehouses.stream()
                .mapToLong(w -> w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0L)
                .sum();
    }

    @Override
    public long sumTotalUnqualifiedQuantity() {
        // 统计所有次品数量
        List<ProductWarehousing> warehouses = productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .select(ProductWarehousing::getUnqualifiedQuantity)
                .list();
        return warehouses.stream()
                .mapToLong(w -> w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0L)
                .sum();
    }

    @Override
    public long countRepairIssues() {
        // 统计返修问题数量（根据实际业务逻辑调整）
        // 这里统计次品备注中包含"返修"关键字的记录数
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .like(ProductWarehousing::getDefectRemark, "返修")
                .count();
    }

    @Override
    public long sumQualifiedQuantityBetween(LocalDateTime start, LocalDateTime end) {
        // 统计指定时间范围内的合格品数量
        List<ProductWarehousing> warehouses = productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .ge(start != null, ProductWarehousing::getWarehousingEndTime, start)
                .le(end != null, ProductWarehousing::getWarehousingEndTime, end)
                .select(ProductWarehousing::getQualifiedQuantity)
                .list();
        return warehouses.stream()
                .mapToLong(w -> w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0L)
                .sum();
    }

    @Override
    public long countRepairIssuesBetween(LocalDateTime start, LocalDateTime end) {
        // 统计指定时间范围内的返修问题数量
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .ge(start != null, ProductWarehousing::getWarehousingEndTime, start)
                .le(end != null, ProductWarehousing::getWarehousingEndTime, end)
                .like(ProductWarehousing::getDefectRemark, "返修")
                .count();
    }
}

