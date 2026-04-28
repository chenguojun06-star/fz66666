package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductWarehousingQueryHelper {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ScanRecordService scanRecordService;

    public IPage<ProductWarehousing> list(Map<String, Object> params) {
        params = applyFactoryFilter(params);
        if (params == null) {
            return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
        }
        IPage<ProductWarehousing> page = productWarehousingService.queryPage(params);
        if (page != null && page.getRecords() != null && !page.getRecords().isEmpty()) {
            enrichWarehousingRecords(page.getRecords());
        }
        return page;
    }

    private Map<String, Object> applyFactoryFilter(Map<String, Object> params) {
        String ctxFactoryId = UserContext.factoryId();
        if (!StringUtils.hasText(ctxFactoryId)) {
            return params;
        }
        List<String> factoryOrderIds = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                        .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
        ).stream().map(ProductionOrder::getId).collect(java.util.stream.Collectors.toList());
        if (factoryOrderIds.isEmpty()) {
            return null;
        }
        Map<String, Object> newParams = new HashMap<>(params != null ? params : new HashMap<>());
        newParams.put("_factoryOrderIds", factoryOrderIds);
        return newParams;
    }

    private void enrichWarehousingRecords(List<ProductWarehousing> records) {
        Set<String> orderIds = records.stream()
            .map(ProductWarehousing::getOrderId)
            .filter(StringUtils::hasText)
            .collect(Collectors.toSet());
        Map<String, ProductionOrder> orderMap = loadProductionOrdersSafely(orderIds, "warehousing-list");

        Map<String, CuttingBundle> bundleByIdMap = new java.util.HashMap<>();
        Map<String, CuttingBundle> bundleByQrMap = new java.util.HashMap<>();
        loadBundleData(records, bundleByIdMap, bundleByQrMap);

        for (ProductWarehousing w : records) {
            if (w == null) continue;
            fillOrderFields(w, orderMap);
            fillBundleFields(w, bundleByIdMap, bundleByQrMap);
            fillQualityOperator(w);
        }
    }

    private void loadBundleData(List<ProductWarehousing> records,
            Map<String, CuttingBundle> bundleByIdMap, Map<String, CuttingBundle> bundleByQrMap) {
        List<String> bundleIds = new ArrayList<>();
        List<String> bundleQrCodes = new ArrayList<>();
        for (ProductWarehousing w : records) {
            if (w == null) continue;
            if (StringUtils.hasText(w.getCuttingBundleId())) {
                bundleIds.add(w.getCuttingBundleId().trim());
            } else if (StringUtils.hasText(w.getCuttingBundleQrCode())) {
                bundleQrCodes.add(w.getCuttingBundleQrCode().trim());
            }
        }
        if (!bundleIds.isEmpty()) {
            try {
                List<CuttingBundle> bundles = cuttingBundleService.listByIds(bundleIds);
                if (bundles != null) {
                    for (CuttingBundle b : bundles) {
                        if (b != null && StringUtils.hasText(b.getId())) {
                            bundleByIdMap.put(b.getId().trim(), b);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("批量查询菲号失败: {}", e.getMessage());
            }
        }
        if (!bundleQrCodes.isEmpty()) {
            try {
                List<CuttingBundle> bundles = cuttingBundleService.list(
                    new LambdaQueryWrapper<CuttingBundle>()
                        .in(CuttingBundle::getQrCode, bundleQrCodes));
                if (bundles != null) {
                    for (CuttingBundle b : bundles) {
                        if (b != null && StringUtils.hasText(b.getQrCode())) {
                            bundleByQrMap.put(b.getQrCode().trim(), b);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("批量查询菲号(QrCode)失败: {}", e.getMessage());
            }
        }
    }

    private void fillOrderFields(ProductWarehousing w, Map<String, ProductionOrder> orderMap) {
        ProductionOrder order = orderMap.get(w.getOrderId());
        if (order != null) {
            if (!StringUtils.hasText(w.getFactoryName())) {
                w.setFactoryName(order.getFactoryName());
            }
            w.setFactoryType(order.getFactoryType());
            w.setOrderBizType(order.getOrderBizType());
            w.setOrgUnitId(order.getOrgUnitId());
            w.setParentOrgUnitId(order.getParentOrgUnitId());
            w.setParentOrgUnitName(order.getParentOrgUnitName());
            w.setOrgPath(order.getOrgPath());
        }
    }

    private void fillBundleFields(ProductWarehousing w,
            Map<String, CuttingBundle> bundleByIdMap, Map<String, CuttingBundle> bundleByQrMap) {
        CuttingBundle bundle = null;
        if (StringUtils.hasText(w.getCuttingBundleId())) {
            bundle = bundleByIdMap.get(w.getCuttingBundleId().trim());
        }
        if (bundle == null && StringUtils.hasText(w.getCuttingBundleQrCode())) {
            bundle = bundleByQrMap.get(w.getCuttingBundleQrCode().trim());
        }
        if (bundle != null) {
            if (!StringUtils.hasText(w.getColor()) && StringUtils.hasText(bundle.getColor())) {
                w.setColor(bundle.getColor());
            }
            if (!StringUtils.hasText(w.getSize()) && StringUtils.hasText(bundle.getSize())) {
                w.setSize(bundle.getSize());
            }
            if (w.getCuttingQuantity() == null && bundle.getQuantity() != null) {
                w.setCuttingQuantity(bundle.getQuantity());
            }
        }
    }

    private void fillQualityOperator(ProductWarehousing w) {
        if (!StringUtils.hasText(w.getQualityOperatorName())) {
            if (StringUtils.hasText(w.getReceiverName())) {
                w.setQualityOperatorName(w.getReceiverName());
            } else if (StringUtils.hasText(w.getWarehousingOperatorName())) {
                w.setQualityOperatorName(w.getWarehousingOperatorName());
            }
        }
    }

    private Map<String, ProductionOrder> loadProductionOrdersSafely(Set<String> orderIds, String scene) {
        if (orderIds == null || orderIds.isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            return productionOrderService.listByIds(orderIds).stream()
                    .collect(Collectors.toMap(ProductionOrder::getId, order -> order, (left, right) -> left));
        } catch (Exception ex) {
            log.error("[{}] 加载生产订单失败，跳过订单补充字段，orderIds={}", scene, orderIds, ex);
            return Collections.emptyMap();
        }
    }

    /**
     * 获取质检入库统计数据（SQL聚合版，替代全量加载到内存）
     * - 全部：已质检入库的记录数和数量
     * - 待质检：有production扫码但无quality扫码的菲号
     * - 待入库：有quality扫码但无warehouse扫码的菲号
     * - 今日完成：今天创建的质检入库记录的订单数和数量
     * - 合格/不合格：按quality_status分组
     */
    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        Map<String, Object> stats = new java.util.LinkedHashMap<>();

        // 1. 质检入库记录统计（SQL聚合，无需加载全量数据到内存）
        try {
            Map<String, Object> warehousingStats = productWarehousingService.getWarehousingStats();
            if (warehousingStats != null) {
                stats.putAll(warehousingStats);
            } else {
                stats.put("totalCount", 0L);
                stats.put("totalOrders", 0L);
                stats.put("totalQuantity", 0L);
                stats.put("qualifiedCount", 0L);
                stats.put("qualifiedQuantity", 0L);
                stats.put("unqualifiedCount", 0L);
                stats.put("unqualifiedQuantity", 0L);
                stats.put("todayCount", 0L);
                stats.put("todayOrders", 0L);
                stats.put("todayQuantity", 0L);
            }
        } catch (Exception e) {
            log.error("质检入库记录统计查询失败: {}", e.getMessage(), e);
            stats.put("totalCount", 0L);
            stats.put("totalOrders", 0L);
            stats.put("totalQuantity", 0L);
            stats.put("qualifiedCount", 0L);
            stats.put("qualifiedQuantity", 0L);
            stats.put("unqualifiedCount", 0L);
            stats.put("unqualifiedQuantity", 0L);
            stats.put("todayCount", 0L);
            stats.put("todayOrders", 0L);
            stats.put("todayQuantity", 0L);
        }

        // 2. 待质检/待入库/待包装统计（SQL聚合，按菲号维度）
        try {
            Map<String, Object> pendingStats = scanRecordService.getBundlePendingStats();
            if (pendingStats != null) {
                stats.put("pendingQcBundles", pendingStats.getOrDefault("pendingQcBundles", 0L));
                stats.put("pendingQcQuantity", pendingStats.getOrDefault("pendingQcQuantity", 0L));
                stats.put("pendingWarehouseBundles", pendingStats.getOrDefault("pendingWarehouseBundles", 0L));
                stats.put("pendingWarehouseQuantity", pendingStats.getOrDefault("pendingWarehouseQuantity", 0L));
                stats.put("pendingPackagingBundles", pendingStats.getOrDefault("pendingPackagingBundles", 0L));
                stats.put("pendingPackagingQuantity", pendingStats.getOrDefault("pendingPackagingQuantity", 0L));
            } else {
                stats.put("pendingQcBundles", 0L);
                stats.put("pendingQcQuantity", 0L);
                stats.put("pendingWarehouseBundles", 0L);
                stats.put("pendingWarehouseQuantity", 0L);
                stats.put("pendingPackagingBundles", 0L);
                stats.put("pendingPackagingQuantity", 0L);
            }
        } catch (Exception e) {
            log.error("待处理菲号统计查询失败: {}", e.getMessage(), e);
            stats.put("pendingQcBundles", 0L);
            stats.put("pendingQcQuantity", 0L);
            stats.put("pendingWarehouseBundles", 0L);
            stats.put("pendingWarehouseQuantity", 0L);
            stats.put("pendingPackagingBundles", 0L);
            stats.put("pendingPackagingQuantity", 0L);
        }

        return stats;
    }


    public ProductWarehousing getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        ProductWarehousing warehousing = productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getId, key)
                .eq(ProductWarehousing::getTenantId, tenantId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .one();
        if (warehousing == null) {
            throw new NoSuchElementException("入库记录不存在");
        }
        return warehousing;
    }
}
