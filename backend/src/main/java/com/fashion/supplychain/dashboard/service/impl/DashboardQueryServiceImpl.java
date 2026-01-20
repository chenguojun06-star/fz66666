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
        return productionOrderService.lambdaQuery().eq(ProductionOrder::getDeleteFlag, 0).count();
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
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getStatus, "delayed")
                .count();
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
}
