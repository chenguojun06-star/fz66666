package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
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
    private ProductionOrderQueryService productionOrderQueryService;

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
            // 补齐订单交期（plannedEndDate），供前端展示交期倒计时
            w.setDeliveryDate(order.getPlannedEndDate());
            w.setOrderBizType(order.getOrderBizType());
            w.setOrgUnitId(order.getOrgUnitId());
            w.setParentOrgUnitId(order.getParentOrgUnitId());
            w.setParentOrgUnitName(order.getParentOrgUnitName());
            w.setOrgPath(order.getOrgPath());
            // 补齐 styleName：从生产订单直接 copy
            if (!StringUtils.hasText(w.getStyleName())) {
                w.setStyleName(order.getStyleName());
            }
            // P1-5 数据链路：补齐 styleCover/coverImage/styleImage，供前端展示款式封面
            // 注意：order.styleCover 等是 @TableField(exist=false) 临时字段，
            // 已在 loadProductionOrdersSafely 中通过 productionOrderQueryService.fillStyleCover() 填充
            if (StringUtils.hasText(order.getStyleCover())) {
                w.setStyleCover(order.getStyleCover());
            }
            if (StringUtils.hasText(order.getCoverImage())) {
                w.setCoverImage(order.getCoverImage());
            }
            if (StringUtils.hasText(order.getStyleImage())) {
                w.setStyleImage(order.getStyleImage());
            }
            // 补齐订单状态/实际完成时间/生产进度，供前端交期倒计时判定终态
            // 修复缺陷：质检已完成的订单仍被计算为逾期
            w.setStatus(order.getStatus());
            w.setActualEndDate(order.getActualEndDate());
            w.setProductionProgress(order.getProductionProgress());
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
            // 床号/子床次：用于区分同扎号不同床的重复菲号显示
            if (w.getBedNo() == null) {
                w.setBedNo(bundle.getBedNo());
            }
            if (w.getBedSubNo() == null) {
                w.setBedSubNo(bundle.getBedSubNo());
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
            List<ProductionOrder> orderList = productionOrderService.listByIds(orderIds);
            // 补齐 styleCover/coverImage/styleImage（从 StyleInfo/附件/模板兜底）
            // 与 ProductWarehousingPendingHelper.loadOrdersWithCover 保持一致
            if (orderList != null && !orderList.isEmpty()) {
                productionOrderQueryService.fillStyleCover(orderList);
            }
            return orderList.stream()
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
     *
     * ★ P0 工厂账号数据泄露修复：原 stats SQL 仅按 tenant_id 聚合，工厂账号可看到全租户数据。
     *   修复后：工厂账号场景下，先获取该工厂的订单 ID 列表，再在 Java 层做订单范围过滤聚合。
     *   非工厂账号仍走 SQL 聚合（性能优先）。
     */
    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        Map<String, Object> stats = new java.util.LinkedHashMap<>();

        // P0 修复：工厂账号先获取订单 ID 列表，用于后续过滤
        String ctxFactoryId = UserContext.factoryId();
        List<String> factoryOrderIds = null;
        if (StringUtils.hasText(ctxFactoryId)) {
            factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
                // 工厂账号无任何订单，stats 全部归零
                return buildEmptyStats(stats);
            }
        }

        // 1. 质检入库记录统计
        if (factoryOrderIds != null) {
            // 工厂账号：Java 层聚合（带订单范围过滤）
            putWarehousingStatsForFactory(stats, factoryOrderIds);
        } else {
            // 非工厂账号：SQL 聚合（性能优先）
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
        }

        // 2. 待质检/待入库/待包装统计
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
        // 注：scanRecordService.getBundlePendingStats() 的工厂账号隔离暂不在此处修复，
        // 因为扫码记录表跨多个订单，工厂账号通常需看到完整扫码流程。
        // 若需严格隔离，应在 ScanRecordMapper.selectBundlePendingStats 中加 order_id 过滤。

        // 3. 待返修菲号统计（有不合格数量且未报废的菲号数）
        try {
            Long tenantId = UserContext.tenantId();
            var repairQuery = productWarehousingService.lambdaQuery()
                .select(ProductWarehousing::getCuttingBundleId, ProductWarehousing::getOrderId)
                .eq(ProductWarehousing::getTenantId, tenantId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .gt(ProductWarehousing::getUnqualifiedQuantity, 0)
                .ne(ProductWarehousing::getRepairStatus, "scrapped");
            // P0 修复：工厂账号只统计该工厂的订单
            if (factoryOrderIds != null) {
                repairQuery.in(ProductWarehousing::getOrderId, factoryOrderIds);
            }
            long pendingRepairCount = repairQuery
                .list()
                .stream()
                .map(ProductWarehousing::getCuttingBundleId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet())
                .size();
            stats.put("pendingRepairBundles", pendingRepairCount);
        } catch (Exception e) {
            log.error("待返修菲号统计查询失败: {}", e.getMessage(), e);
            stats.put("pendingRepairBundles", 0L);
        }

        return stats;
    }

    private Map<String, Object> buildEmptyStats(Map<String, Object> stats) {
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
        stats.put("pendingQcBundles", 0L);
        stats.put("pendingQcQuantity", 0L);
        stats.put("pendingWarehouseBundles", 0L);
        stats.put("pendingWarehouseQuantity", 0L);
        stats.put("pendingPackagingBundles", 0L);
        stats.put("pendingPackagingQuantity", 0L);
        stats.put("pendingRepairBundles", 0L);
        return stats;
    }

    /**
     * 工厂账号场景下的质检入库统计（Java 层聚合，带订单范围过滤）
     * 替代 SQL 聚合 selectWarehousingStats，保证工厂账号只看到自己工厂的数据
     */
    private void putWarehousingStatsForFactory(Map<String, Object> stats, List<String> factoryOrderIds) {
        try {
            Long tenantId = UserContext.tenantId();
            java.time.LocalDate today = java.time.LocalDate.now();
            java.time.LocalDateTime todayStart = today.atStartOfDay();
            java.time.LocalDateTime tomorrowStart = today.plusDays(1).atStartOfDay();

            List<ProductWarehousing> records = productWarehousingService.lambdaQuery()
                    .eq(ProductWarehousing::getTenantId, tenantId)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .in(ProductWarehousing::getOrderId, factoryOrderIds)
                    .list();

            long totalCount = records.size();
            long totalQuantity = 0L;
            long qualifiedCount = 0L;
            long qualifiedQuantity = 0L;
            long unqualifiedCount = 0L;
            long unqualifiedQuantity = 0L;
            long todayCount = 0L;
            long todayQuantity = 0L;
            Set<String> orderNoSet = new java.util.HashSet<>();
            Set<String> todayOrderNoSet = new java.util.HashSet<>();

            for (ProductWarehousing w : records) {
                if (w == null) continue;
                long qty = w.getWarehousingQuantity() != null ? w.getWarehousingQuantity() : 0L;
                totalQuantity += qty;
                if (StringUtils.hasText(w.getOrderNo())) {
                    orderNoSet.add(w.getOrderNo());
                }
                String qualityStatus = w.getQualityStatus() != null ? w.getQualityStatus().toLowerCase() : "";
                boolean isUnqualified = "unqualified".equals(qualityStatus);
                if (isUnqualified) {
                    unqualifiedCount++;
                    unqualifiedQuantity += (w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0L);
                } else {
                    qualifiedCount++;
                    qualifiedQuantity += (w.getQualifiedQuantity() != null
                            ? w.getQualifiedQuantity() : (w.getWarehousingQuantity() != null ? w.getWarehousingQuantity() : 0L));
                }
                java.time.LocalDateTime createTime = w.getCreateTime();
                if (createTime != null && !createTime.isBefore(todayStart) && createTime.isBefore(tomorrowStart)) {
                    todayCount++;
                    todayQuantity += qty;
                    if (StringUtils.hasText(w.getOrderNo())) {
                        todayOrderNoSet.add(w.getOrderNo());
                    }
                }
            }

            stats.put("totalCount", totalCount);
            stats.put("totalOrders", (long) orderNoSet.size());
            stats.put("totalQuantity", totalQuantity);
            stats.put("qualifiedCount", qualifiedCount);
            stats.put("qualifiedQuantity", qualifiedQuantity);
            stats.put("unqualifiedCount", unqualifiedCount);
            stats.put("unqualifiedQuantity", unqualifiedQuantity);
            stats.put("todayCount", todayCount);
            stats.put("todayOrders", (long) todayOrderNoSet.size());
            stats.put("todayQuantity", todayQuantity);
        } catch (Exception e) {
            log.error("工厂账号质检入库统计查询失败: {}", e.getMessage(), e);
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
