package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.service.ReceivableService;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.intelligence.dto.OrphanDataItemDTO;
import com.fashion.supplychain.intelligence.dto.OrphanDataScanResultDTO;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialQualityIssue;
import com.fashion.supplychain.production.entity.ProcessPriceAdjustment;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialQualityIssueService;
import com.fashion.supplychain.production.service.ProcessPriceAdjustmentService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionExceptionReportService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Slf4j
public class OrphanDataDetector {

    private static final Set<String> ORPHAN_ORDER_STATUSES = Set.of("cancelled", "scrapped", "closed", "archived");

    private static final Map<String, String> ORPHAN_STATUS_LABEL = Map.of(
            "cancelled", "已取消",
            "scrapped", "已报废",
            "closed", "已关单",
            "archived", "已归档"
    );

    private static final LinkedHashMap<String, String[]> TABLE_META = new LinkedHashMap<>();
    static {
        TABLE_META.put("t_scan_record",               new String[]{"扫码记录",   "生产管理", "📱"});
        TABLE_META.put("t_material_purchase",          new String[]{"面料采购",   "生产管理", "📦"});
        TABLE_META.put("t_product_warehousing",        new String[]{"成品入库",   "生产管理", "🏭"});
        TABLE_META.put("t_product_outstock",           new String[]{"成品出库",   "生产管理", "🚚"});
        TABLE_META.put("t_factory_shipment",           new String[]{"工厂发货",   "生产管理", "🚛"});
        TABLE_META.put("t_cutting_task",               new String[]{"裁剪任务",   "生产管理", "✂️"});
        TABLE_META.put("t_cutting_bundle",             new String[]{"裁剪扎条",   "生产管理", "🧵"});
        TABLE_META.put("t_production_process_tracking", new String[]{"工序追踪",  "生产管理", "📊"});
        TABLE_META.put("t_process_price_adjustment",   new String[]{"工序调价",   "生产管理", "💲"});
        TABLE_META.put("t_material_picking",           new String[]{"物料出库单", "生产管理", "📋"});
        TABLE_META.put("t_material_quality_issue",     new String[]{"物料品质异常", "生产管理", "⚠️"});
        TABLE_META.put("t_production_exception_report", new String[]{"生产异常报告", "生产管理", "🚨"});
        TABLE_META.put("t_bill_aggregation",           new String[]{"账单汇总",   "财务管理", "💰"});
        TABLE_META.put("t_receivable",                 new String[]{"应收款",     "客户管理", "💳"});
    }

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ScanRecordService scanRecordService;
    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private ProductWarehousingService productWarehousingService;
    @Autowired private ProductOutstockService productOutstockService;
    @Autowired private FactoryShipmentService factoryShipmentService;
    @Autowired private CuttingTaskService cuttingTaskService;
    @Autowired private CuttingBundleService cuttingBundleService;
    @Autowired private ProductionProcessTrackingService processTrackingService;
    @Autowired private ProcessPriceAdjustmentService processPriceAdjustmentService;
    @Autowired private MaterialPickingService materialPickingService;
    @Autowired private MaterialQualityIssueService materialQualityIssueService;
    @Autowired private ProductionExceptionReportService exceptionReportService;
    @Autowired private BillAggregationService billAggregationService;
    @Autowired private ReceivableService receivableService;

    public OrphanDataScanResultDTO scan() {
        Long tenantId = UserContext.tenantId();

        Set<String> orphanOrderIds = getOrphanOrderIds(tenantId);

        Map<String, OrphanDataScanResultDTO.CategoryStat> categoryStats = new LinkedHashMap<>();
        long totalOrphanCount = 0;

        // 所有统计均用 safeCount 包裹：云端若某表缺失或有缺列，直接跳过返回 0，
        // 而不是整个扫描接口 500。之前仅 t_process_price_adjustment 被包裹，其余 13 个裸调用
        // 会因 t_bill_aggregation / t_receivable 等表在云端不存在而抛异常导致全接口 500。
        Map<String, Long> counts = new HashMap<>();
        counts.put("t_scan_record",                safeCount(() -> countScanRecords(orphanOrderIds, tenantId), "t_scan_record"));
        counts.put("t_material_purchase",           safeCount(() -> countMaterialPurchases(orphanOrderIds, tenantId), "t_material_purchase"));
        counts.put("t_product_warehousing",         safeCount(() -> countProductWarehousing(orphanOrderIds, tenantId), "t_product_warehousing"));
        counts.put("t_product_outstock",            safeCount(() -> countProductOutstocks(orphanOrderIds, tenantId), "t_product_outstock"));
        counts.put("t_factory_shipment",            safeCount(() -> countFactoryShipments(orphanOrderIds, tenantId), "t_factory_shipment"));
        counts.put("t_cutting_task",                safeCount(() -> countCuttingTasks(orphanOrderIds, tenantId), "t_cutting_task"));
        counts.put("t_cutting_bundle",              safeCount(() -> countCuttingBundles(orphanOrderIds, tenantId), "t_cutting_bundle"));
        counts.put("t_production_process_tracking", safeCount(() -> countProcessTrackings(orphanOrderIds, tenantId), "t_production_process_tracking"));
        counts.put("t_process_price_adjustment",    safeCount(() -> countProcessPriceAdjustments(orphanOrderIds, tenantId), "t_process_price_adjustment"));
        counts.put("t_material_picking",            safeCount(() -> countMaterialPickings(orphanOrderIds, tenantId), "t_material_picking"));
        counts.put("t_material_quality_issue",      safeCount(() -> countMaterialQualityIssues(orphanOrderIds, tenantId), "t_material_quality_issue"));
        counts.put("t_production_exception_report", safeCount(() -> countExceptionReports(orphanOrderIds, tenantId), "t_production_exception_report"));
        counts.put("t_bill_aggregation",            safeCount(() -> countBillAggregations(orphanOrderIds, tenantId), "t_bill_aggregation"));
        counts.put("t_receivable",                  safeCount(() -> countReceivables(orphanOrderIds, tenantId), "t_receivable"));

        for (Map.Entry<String, Long> entry : counts.entrySet()) {
            String table = entry.getKey();
            long count = entry.getValue();
            if (count > 0) {
                String[] meta = TABLE_META.get(table);
                categoryStats.put(table, new OrphanDataScanResultDTO.CategoryStat(
                        table, meta[0], meta[1], (int) count, meta[2]));
                totalOrphanCount += count;
            }
        }

        OrphanDataScanResultDTO result = new OrphanDataScanResultDTO();
        result.setTotalOrphanCount((int) totalOrphanCount);
        result.setCategoryStats(categoryStats);
        result.setScanTime(LocalDateTime.now());
        return result;
    }

    public List<OrphanDataItemDTO> listOrphanData(String tableName, int page, int pageSize) {
        Long tenantId = UserContext.tenantId();
        Set<String> orphanOrderIds = getOrphanOrderIds(tenantId);
        if (orphanOrderIds.isEmpty()) return List.of();

        int offset = (page - 1) * pageSize;
        Map<String, String> statusCache = batchGetOrderStatus(orphanOrderIds);

        switch (tableName) {
            case "t_scan_record":               return listScanRecords(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_material_purchase":          return listMaterialPurchases(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_product_warehousing":        return listProductWarehousing(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_product_outstock":           return listProductOutstocks(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_factory_shipment":           return listFactoryShipments(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_cutting_task":               return listCuttingTasks(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_cutting_bundle":             return listCuttingBundles(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_production_process_tracking": return listProcessTrackings(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_process_price_adjustment":   return listProcessPriceAdjustments(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_material_picking":           return listMaterialPickings(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_material_quality_issue":     return listMaterialQualityIssues(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_production_exception_report": return listExceptionReports(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_bill_aggregation":           return listBillAggregations(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            case "t_receivable":                 return listReceivables(orphanOrderIds, tenantId, offset, pageSize, statusCache);
            default: return List.of();
        }
    }

    @org.springframework.transaction.annotation.Transactional
    public int deleteOrphanData(String tableName, List<String> ids) {
        if (ids == null || ids.isEmpty()) return 0;
        int deleted = 0;
        switch (tableName) {
            case "t_scan_record":               deleted = softDeleteByIds(scanRecordService, ids); break;
            case "t_material_purchase":          deleted = softDeleteMaterialPurchases(ids); break;
            case "t_product_warehousing":        deleted = softDeleteProductWarehousing(ids); break;
            case "t_product_outstock":           deleted = softDeleteByIds(productOutstockService, ids); break;
            case "t_factory_shipment":           deleted = softDeleteByIds(factoryShipmentService, ids); break;
            case "t_cutting_task":               deleted = softDeleteByIds(cuttingTaskService, ids); break;
            case "t_cutting_bundle":             deleted = softDeleteByIds(cuttingBundleService, ids); break;
            case "t_production_process_tracking": deleted = softDeleteByIds(processTrackingService, ids); break;
            case "t_process_price_adjustment":   deleted = softDeleteByIds(processPriceAdjustmentService, ids); break;
            case "t_material_picking":           deleted = softDeleteByIds(materialPickingService, ids); break;
            case "t_material_quality_issue":     deleted = softDeleteMaterialQualityIssues(ids); break;
            case "t_production_exception_report": deleted = softDeleteByIds(exceptionReportService, ids); break;
            case "t_bill_aggregation":           deleted = softDeleteByIds(billAggregationService, ids); break;
            case "t_receivable":                 deleted = softDeleteByIds(receivableService, ids); break;
            default: break;
        }
        log.info("孤立数据清理: table={}, count={}, operator={}", tableName, deleted, UserContext.username());
        return deleted;
    }

    private <T> int softDeleteByIds(com.baomidou.mybatisplus.extension.service.IService<T> service, List<String> ids) {
        if (ids == null || ids.isEmpty()) return 0;
        try {
            service.removeByIds(ids);
            return ids.size();
        } catch (Exception e) {
            log.warn("批量删除失败，回退逐条删除: {}", e.getMessage());
            int c = 0;
            for (String id : ids) {
                try { if (service.removeById(id)) c++; } catch (Exception ex) { log.warn("删除失败 id={}: {}", id, ex.getMessage()); }
            }
            return c;
        }
    }

    private Set<String> getOrphanOrderIds(Long tenantId) {
        Set<String> ids = new java.util.HashSet<>();
        productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId)
                .eq(ProductionOrder::getTenantId, tenantId)
                .in(ProductionOrder::getStatus, ORPHAN_ORDER_STATUSES)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .list().forEach(o -> ids.add(o.getId()));
        productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 1)
                .list().forEach(o -> ids.add(o.getId()));
        return ids;
    }

    private Set<String> getOrphanOrderNos(Long tenantId) {
        Set<String> nos = new java.util.HashSet<>();
        productionOrderService.lambdaQuery()
                .select(ProductionOrder::getOrderNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .in(ProductionOrder::getStatus, ORPHAN_ORDER_STATUSES)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .list().forEach(o -> nos.add(o.getOrderNo()));
        productionOrderService.lambdaQuery()
                .select(ProductionOrder::getOrderNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 1)
                .list().forEach(o -> nos.add(o.getOrderNo()));
        return nos;
    }

    private String resolveOrderStatus(Map<String, String> statusCache, String orderId) {
        if (!StringUtils.hasText(orderId)) return "";
        String status = statusCache.get(orderId);
        return status != null ? status : "订单不存在";
    }

    private Map<String, String> batchGetOrderStatus(Set<String> orderIds) {
        if (orderIds == null || orderIds.isEmpty()) return java.util.Collections.emptyMap();
        Map<String, String> result = new java.util.HashMap<>();
        productionOrderService.lambdaQuery()
                .in(ProductionOrder::getId, orderIds)
                .select(ProductionOrder::getId, ProductionOrder::getStatus)
                .list().forEach(o -> result.put(o.getId(), o.getStatus()));
        return result;
    }

    private String buildOrphanReason(String orderStatus) {
        if (!StringUtils.hasText(orderStatus) || "订单不存在".equals(orderStatus)) {
            return "关联订单已删除或不存在";
        }
        String label = ORPHAN_STATUS_LABEL.getOrDefault(orderStatus, orderStatus);
        return "订单" + label;
    }

    // ── count methods ──

    private long countScanRecords(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return scanRecordService.lambdaQuery().in(ScanRecord::getOrderId, deadIds)
                .eq(ScanRecord::getTenantId, tenantId).count();
    }
    private long countMaterialPurchases(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return materialPurchaseService.lambdaQuery().in(MaterialPurchase::getOrderId, deadIds)
                .eq(MaterialPurchase::getTenantId, tenantId).ne(MaterialPurchase::getDeleteFlag, 1).count();
    }
    private long countProductWarehousing(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return productWarehousingService.lambdaQuery().in(ProductWarehousing::getOrderId, deadIds)
                .eq(ProductWarehousing::getTenantId, tenantId).ne(ProductWarehousing::getDeleteFlag, 1).count();
    }
    private long countProductOutstocks(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return productOutstockService.lambdaQuery().in(ProductOutstock::getOrderId, deadIds)
                .eq(ProductOutstock::getTenantId, tenantId).count();
    }
    private long countFactoryShipments(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return factoryShipmentService.lambdaQuery().in(FactoryShipment::getOrderId, deadIds)
                .eq(FactoryShipment::getTenantId, tenantId).count();
    }
    private long countCuttingTasks(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return cuttingTaskService.lambdaQuery().in(CuttingTask::getProductionOrderId, deadIds)
                .eq(CuttingTask::getTenantId, tenantId).count();
    }
    private long countCuttingBundles(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return cuttingBundleService.lambdaQuery().in(CuttingBundle::getProductionOrderId, deadIds)
                .eq(CuttingBundle::getTenantId, tenantId).count();
    }
    private long countProcessTrackings(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return processTrackingService.lambdaQuery().in(ProductionProcessTracking::getProductionOrderId, deadIds)
                .eq(ProductionProcessTracking::getTenantId, tenantId).count();
    }
    private long countProcessPriceAdjustments(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return processPriceAdjustmentService.lambdaQuery().in(ProcessPriceAdjustment::getOrderId, deadIds)
                .eq(ProcessPriceAdjustment::getTenantId, tenantId).count();
    }
    /** 安全统计：若表不存在则返回 0，避免孤儿数据扫描因缺表整体 500 */
    private long safeCount(java.util.function.Supplier<Long> fn, String tableName) {
        try { return fn.get(); }
        catch (Exception e) {
            log.warn("[OrphanDetector] 统计跳过 — 表可能不存在: {} ({})", tableName, e.getMessage());
            return 0L;
        }
    }
    private long countMaterialPickings(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return materialPickingService.lambdaQuery().in(MaterialPicking::getOrderId, deadIds)
                .eq(MaterialPicking::getTenantId, tenantId).count();
    }
    private long countMaterialQualityIssues(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return materialQualityIssueService.lambdaQuery().in(MaterialQualityIssue::getOrderId, deadIds)
                .eq(MaterialQualityIssue::getTenantId, tenantId).eq(MaterialQualityIssue::getDeleteFlag, 0).count();
    }
    private long countExceptionReports(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        Set<String> orphanOrderNos = getOrphanOrderNos(tenantId);
        if (orphanOrderNos.isEmpty()) return 0;
        return exceptionReportService.lambdaQuery().in(ProductionExceptionReport::getOrderNo, orphanOrderNos)
                .eq(ProductionExceptionReport::getTenantId, tenantId).count();
    }
    private long countBillAggregations(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return billAggregationService.lambdaQuery().in(BillAggregation::getOrderId, deadIds)
                .eq(BillAggregation::getTenantId, tenantId).count();
    }
    private long countReceivables(Set<String> deadIds, Long tenantId) {
        if (deadIds.isEmpty()) return 0;
        return receivableService.lambdaQuery().in(Receivable::getOrderId, deadIds)
                .eq(Receivable::getTenantId, tenantId).count();
    }

    // ── list methods ──

    private List<OrphanDataItemDTO> listScanRecords(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return scanRecordService.lambdaQuery().in(ScanRecord::getOrderId, deadIds)
                .eq(ScanRecord::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(r -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(r.getId()); d.setTableName("t_scan_record"); d.setTableLabel("扫码记录"); d.setModule("生产管理");
                    d.setOrderId(r.getOrderId()); d.setOrderNo(r.getOrderNo()); d.setStyleNo(r.getStyleNo());
                    d.setSummary(r.getProcessName() + " " + r.getQuantity() + "件");
                    String status = resolveOrderStatus(statusCache, r.getOrderId());
                    d.setCreateTime(r.getScanTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listMaterialPurchases(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return materialPurchaseService.lambdaQuery().in(MaterialPurchase::getOrderId, deadIds)
                .eq(MaterialPurchase::getTenantId, tenantId).ne(MaterialPurchase::getDeleteFlag, 1)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(p -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(p.getId()); d.setTableName("t_material_purchase"); d.setTableLabel("面料采购"); d.setModule("生产管理");
                    d.setOrderId(p.getOrderId()); d.setOrderNo(p.getOrderNo()); d.setStyleNo(p.getStyleNo());
                    d.setSummary(p.getMaterialName() + " " + (p.getPurchaseQuantity() != null ? p.getPurchaseQuantity() : 0) + (p.getUnit() != null ? p.getUnit() : ""));
                    String status = resolveOrderStatus(statusCache, p.getOrderId());
                    d.setCreateTime(p.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listProductWarehousing(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return productWarehousingService.lambdaQuery().in(ProductWarehousing::getOrderId, deadIds)
                .eq(ProductWarehousing::getTenantId, tenantId).ne(ProductWarehousing::getDeleteFlag, 1)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(w -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(w.getId()); d.setTableName("t_product_warehousing"); d.setTableLabel("成品入库"); d.setModule("生产管理");
                    d.setOrderId(w.getOrderId()); d.setOrderNo(w.getOrderNo()); d.setStyleNo(w.getStyleNo());
                    d.setSummary("入库" + (w.getWarehousingQuantity() != null ? w.getWarehousingQuantity() : 0) + "件");
                    String status = resolveOrderStatus(statusCache, w.getOrderId());
                    d.setCreateTime(w.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listProductOutstocks(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return productOutstockService.lambdaQuery().in(ProductOutstock::getOrderId, deadIds)
                .eq(ProductOutstock::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(o -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(o.getId()); d.setTableName("t_product_outstock"); d.setTableLabel("成品出库"); d.setModule("生产管理");
                    d.setOrderId(o.getOrderId()); d.setOrderNo(o.getOrderNo()); d.setStyleNo(o.getStyleNo());
                    d.setSummary("出库记录");
                    String status = resolveOrderStatus(statusCache, o.getOrderId());
                    d.setCreateTime(o.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listFactoryShipments(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return factoryShipmentService.lambdaQuery().in(FactoryShipment::getOrderId, deadIds)
                .eq(FactoryShipment::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(s -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(s.getId()); d.setTableName("t_factory_shipment"); d.setTableLabel("工厂发货"); d.setModule("生产管理");
                    d.setOrderId(s.getOrderId()); d.setOrderNo(s.getOrderNo()); d.setStyleNo(s.getStyleNo());
                    d.setSummary("发货记录");
                    String status = resolveOrderStatus(statusCache, s.getOrderId());
                    d.setCreateTime(s.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listCuttingTasks(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return cuttingTaskService.lambdaQuery().in(CuttingTask::getProductionOrderId, deadIds)
                .eq(CuttingTask::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(t -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(t.getId()); d.setTableName("t_cutting_task"); d.setTableLabel("裁剪任务"); d.setModule("生产管理");
                    d.setOrderId(t.getProductionOrderId()); d.setOrderNo(t.getProductionOrderNo()); d.setStyleNo(t.getStyleNo());
                    d.setSummary("裁剪" + (t.getOrderQuantity() != null ? t.getOrderQuantity() : 0) + "件");
                    String status = resolveOrderStatus(statusCache, t.getProductionOrderId());
                    d.setCreateTime(t.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listCuttingBundles(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return cuttingBundleService.lambdaQuery().in(CuttingBundle::getProductionOrderId, deadIds)
                .eq(CuttingBundle::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(b -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(b.getId()); d.setTableName("t_cutting_bundle"); d.setTableLabel("裁剪扎条"); d.setModule("生产管理");
                    d.setOrderId(b.getProductionOrderId()); d.setOrderNo(b.getProductionOrderNo()); d.setStyleNo(b.getStyleNo());
                    d.setSummary(b.getQrCode() != null ? b.getQrCode() : "扎条记录");
                    String status = resolveOrderStatus(statusCache, b.getProductionOrderId());
                    d.setCreateTime(b.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listProcessTrackings(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return processTrackingService.lambdaQuery().in(ProductionProcessTracking::getProductionOrderId, deadIds)
                .eq(ProductionProcessTracking::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(t -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(t.getId()); d.setTableName("t_production_process_tracking"); d.setTableLabel("工序追踪"); d.setModule("生产管理");
                    d.setOrderId(t.getProductionOrderId()); d.setOrderNo(t.getProductionOrderNo()); d.setStyleNo("");
                    d.setSummary(t.getProcessName() != null ? t.getProcessName() : "追踪记录");
                    String status = resolveOrderStatus(statusCache, t.getProductionOrderId());
                    d.setCreateTime(null); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listProcessPriceAdjustments(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return processPriceAdjustmentService.lambdaQuery().in(ProcessPriceAdjustment::getOrderId, deadIds)
                .eq(ProcessPriceAdjustment::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(a -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(a.getId()); d.setTableName("t_process_price_adjustment"); d.setTableLabel("工序调价"); d.setModule("生产管理");
                    d.setOrderId(a.getOrderId()); d.setOrderNo(a.getOrderNo()); d.setStyleNo("");
                    d.setSummary("调价记录");
                    String status = resolveOrderStatus(statusCache, a.getOrderId());
                    d.setCreateTime(a.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listMaterialPickings(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return materialPickingService.lambdaQuery().in(MaterialPicking::getOrderId, deadIds)
                .eq(MaterialPicking::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(p -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(p.getId()); d.setTableName("t_material_picking"); d.setTableLabel("物料出库单"); d.setModule("生产管理");
                    d.setOrderId(p.getOrderId()); d.setOrderNo(p.getOrderNo()); d.setStyleNo(p.getStyleNo());
                    d.setSummary(p.getPickingNo() != null ? p.getPickingNo() : "出库单");
                    String status = resolveOrderStatus(statusCache, p.getOrderId());
                    d.setCreateTime(p.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listMaterialQualityIssues(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return materialQualityIssueService.lambdaQuery().in(MaterialQualityIssue::getOrderId, deadIds)
                .eq(MaterialQualityIssue::getTenantId, tenantId).eq(MaterialQualityIssue::getDeleteFlag, 0)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(i -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(i.getId()); d.setTableName("t_material_quality_issue"); d.setTableLabel("物料品质异常"); d.setModule("生产管理");
                    d.setOrderId(i.getOrderId()); d.setOrderNo(i.getOrderNo()); d.setStyleNo(i.getStyleNo());
                    d.setSummary(i.getMaterialName() + " " + (i.getIssueType() != null ? i.getIssueType() : ""));
                    String status = resolveOrderStatus(statusCache, i.getOrderId());
                    d.setCreateTime(i.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listExceptionReports(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        Set<String> orphanOrderNos = getOrphanOrderNos(tenantId);
        if (orphanOrderNos.isEmpty()) return List.of();
        return exceptionReportService.lambdaQuery().in(ProductionExceptionReport::getOrderNo, orphanOrderNos)
                .eq(ProductionExceptionReport::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(r -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(String.valueOf(r.getId())); d.setTableName("t_production_exception_report"); d.setTableLabel("生产异常报告"); d.setModule("生产管理");
                    d.setOrderId(""); d.setOrderNo(r.getOrderNo()); d.setStyleNo("");
                    d.setSummary(r.getExceptionType() != null ? r.getExceptionType() : "异常报告");
                    d.setCreateTime(r.getCreateTime()); d.setOrphanReason("关联订单已取消/报废/关单/归档"); d.setOrderStatus("");
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listBillAggregations(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return billAggregationService.lambdaQuery().in(BillAggregation::getOrderId, deadIds)
                .eq(BillAggregation::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(b -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(b.getId()); d.setTableName("t_bill_aggregation"); d.setTableLabel("账单汇总"); d.setModule("财务管理");
                    d.setOrderId(b.getOrderId()); d.setOrderNo(b.getOrderNo()); d.setStyleNo(b.getStyleNo());
                    d.setSummary("账单" + (b.getBillNo() != null ? b.getBillNo() : ""));
                    String status = resolveOrderStatus(statusCache, b.getOrderId());
                    d.setCreateTime(b.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }
    private List<OrphanDataItemDTO> listReceivables(Set<String> deadIds, Long tenantId, int offset, int limit, Map<String, String> statusCache) {
        return receivableService.lambdaQuery().in(Receivable::getOrderId, deadIds)
                .eq(Receivable::getTenantId, tenantId)
                .last("LIMIT " + limit + " OFFSET " + offset).list().stream().map(r -> {
                    OrphanDataItemDTO d = new OrphanDataItemDTO();
                    d.setId(r.getId()); d.setTableName("t_receivable"); d.setTableLabel("应收款"); d.setModule("客户管理");
                    d.setOrderId(r.getOrderId()); d.setOrderNo(r.getOrderNo()); d.setStyleNo("");
                    d.setSummary("应收款" + (r.getAmount() != null ? r.getAmount().toPlainString() : ""));
                    String status = resolveOrderStatus(statusCache, r.getOrderId());
                    d.setCreateTime(r.getCreateTime()); d.setOrphanReason(buildOrphanReason(status)); d.setOrderStatus(status);
                    return d;
                }).collect(Collectors.toList());
    }

    // ── soft delete with deleteFlag ──

    private int softDeleteMaterialPurchases(List<String> ids) {
        try {
            return materialPurchaseService.lambdaUpdate()
                    .in(MaterialPurchase::getId, ids)
                    .set(MaterialPurchase::getDeleteFlag, 1)
                    .set(MaterialPurchase::getUpdateTime, LocalDateTime.now())
                    .update() ? ids.size() : 0;
        } catch (Exception e) { log.warn("批量删除MaterialPurchase失败: {}", e.getMessage()); return 0; }
    }
    private int softDeleteProductWarehousing(List<String> ids) {
        try {
            return productWarehousingService.lambdaUpdate()
                    .in(ProductWarehousing::getId, ids)
                    .set(ProductWarehousing::getDeleteFlag, 1)
                    .set(ProductWarehousing::getUpdateTime, LocalDateTime.now())
                    .update() ? ids.size() : 0;
        } catch (Exception e) { log.warn("批量删除ProductWarehousing失败: {}", e.getMessage()); return 0; }
    }
    private int softDeleteMaterialQualityIssues(List<String> ids) {
        try {
            return materialQualityIssueService.lambdaUpdate()
                    .in(MaterialQualityIssue::getId, ids)
                    .set(MaterialQualityIssue::getDeleteFlag, 1)
                    .set(MaterialQualityIssue::getUpdateTime, LocalDateTime.now())
                    .update() ? ids.size() : 0;
        } catch (Exception e) { log.warn("批量删除MaterialQualityIssue失败: {}", e.getMessage()); return 0; }
    }
}
