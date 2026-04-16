package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
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

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private com.fashion.supplychain.production.service.impl.ProductWarehousingHelper warehousingHelper;

    public IPage<ProductWarehousing> list(Map<String, Object> params) {
        // 工厂账号隔离：只查询该工厂的入库记录
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(java.util.stream.Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
                return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
            }
            params = new HashMap<>(params != null ? params : new HashMap<>());
            params.put("_factoryOrderIds", factoryOrderIds);
        }
        IPage<ProductWarehousing> page = productWarehousingService.queryPage(params);
        // 填充缺失的显示字段（兼容旧数据）
        if (page != null && page.getRecords() != null && !page.getRecords().isEmpty()) {
            Set<String> orderIds = page.getRecords().stream()
                .map(ProductWarehousing::getOrderId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
            Map<String, ProductionOrder> orderMap = loadProductionOrdersSafely(orderIds, "warehousing-list");
            // 收集所有需要查询的菲号ID和二维码
            List<String> bundleIds = new ArrayList<>();
            List<String> bundleQrCodes = new ArrayList<>();
            for (ProductWarehousing w : page.getRecords()) {
                if (w == null) continue;
                if (StringUtils.hasText(w.getCuttingBundleId())) {
                    bundleIds.add(w.getCuttingBundleId().trim());
                } else if (StringUtils.hasText(w.getCuttingBundleQrCode())) {
                    bundleQrCodes.add(w.getCuttingBundleQrCode().trim());
                }
            }

            // 批量查询菲号以获取颜色和尺码
            Map<String, CuttingBundle> bundleByIdMap = new java.util.HashMap<>();
            Map<String, CuttingBundle> bundleByQrMap = new java.util.HashMap<>();
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

            for (ProductWarehousing w : page.getRecords()) {
                if (w == null) continue;

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

                // 填充颜色和尺码
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

                // 质检人员：优先 qualityOperatorName，其次 receiverName，再次 warehousingOperatorName
                if (!StringUtils.hasText(w.getQualityOperatorName())) {
                    if (StringUtils.hasText(w.getReceiverName())) {
                        w.setQualityOperatorName(w.getReceiverName());
                    } else if (StringUtils.hasText(w.getWarehousingOperatorName())) {
                        w.setQualityOperatorName(w.getWarehousingOperatorName());
                    }
                }
            }
        }
        return page;
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


    /**
     * 查询各状态的待处理菲号列表
     * @param status pendingQc(待质检) | pendingPackaging(待包装) | pendingWarehouse(待入库)
     */
    public List<Map<String, Object>> listPendingBundles(String status) {
        if (!StringUtils.hasText(status)) {
            throw new IllegalArgumentException("status参数不能为空");
        }

        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        List<ScanRecord> allBundleScans;
        LambdaQueryWrapper<ScanRecord> q = new LambdaQueryWrapper<ScanRecord>()
                .isNotNull(ScanRecord::getCuttingBundleId)
                .ne(ScanRecord::getCuttingBundleId, "")
                .eq(ScanRecord::getScanResult, "success");
        if (tenantId != null) {
            q.eq(ScanRecord::getTenantId, tenantId);
        }
        allBundleScans = scanRecordService.list(q);

        Map<String, Set<String>> bundleScanTypes = new HashMap<>();
        Map<String, Integer> bundleQuantities = new HashMap<>();
        Map<String, String> bundleOrderIds = new HashMap<>();
        Map<String, String> bundleOrderNos = new HashMap<>();
        Map<String, String> bundleStyleNos = new HashMap<>();
        Map<String, Set<String>> bundleProcessCodes = new HashMap<>();
        Map<String, Boolean> bundleQualityConfirmed = new HashMap<>();
        Map<String, Boolean> bundleDefectiveConfirmed = new HashMap<>();
        Map<String, Boolean> bundleWarehouseDone = new HashMap<>();

        for (ScanRecord scan : allBundleScans) {
            String bundleId = scan.getCuttingBundleId().trim();
            String scanType = scan.getScanType();
            if (!StringUtils.hasText(scanType)) continue;
            String scanResult = scan.getScanResult() == null ? "" : scan.getScanResult().trim().toLowerCase();
            if (!"success".equals(scanResult)) continue;

            String processCode = scan.getProcessCode() == null ? "" : scan.getProcessCode().trim();
            String processCodeLower = processCode.toLowerCase();
            String processName = scan.getProcessName() == null ? "" : scan.getProcessName().trim();

            bundleScanTypes.computeIfAbsent(bundleId, k -> new HashSet<>()).add(scanType);
            if (scan.getQuantity() != null && scan.getQuantity() > 0) {
                bundleQuantities.merge(bundleId, scan.getQuantity(), Math::max);
            }
            if (StringUtils.hasText(scan.getOrderId())) {
                bundleOrderIds.putIfAbsent(bundleId, scan.getOrderId().trim());
            }
            if (StringUtils.hasText(scan.getOrderNo())) {
                bundleOrderNos.putIfAbsent(bundleId, scan.getOrderNo().trim());
            }
            if (StringUtils.hasText(scan.getStyleNo())) {
                bundleStyleNos.putIfAbsent(bundleId, scan.getStyleNo().trim());
            }
            if (StringUtils.hasText(processCode)) {
                bundleProcessCodes.computeIfAbsent(bundleId, k -> new HashSet<>()).add(processCode);
            }

            if ("quality".equals(scanType)
                    && "quality_receive".equals(processCode)
                    && scan.getConfirmTime() != null) {
                bundleQualityConfirmed.put(bundleId, true);
                String remark = scan.getRemark() == null ? "" : scan.getRemark().trim().toLowerCase();
                if (remark.startsWith("unqualified")) {
                    bundleDefectiveConfirmed.put(bundleId, true);
                }
            }

            if ("warehouse".equals(scanType)
                    && !"warehouse_rollback".equals(processCodeLower)) {
                bundleWarehouseDone.put(bundleId, true);
            }
        }

        Set<String> packagingDoneBundleIds = new HashSet<>();
        for (Map.Entry<String, Set<String>> entry : bundleProcessCodes.entrySet()) {
            for (String pc : entry.getValue()) {
                String processCode = pc == null ? "" : pc.trim().toLowerCase();
                if (processCode.contains("packaging")
                        || "包装".equals(pc)
                        || "打包".equals(pc)
                        || "入袋".equals(pc)
                        || "后整".equals(pc)
                        || "装箱".equals(pc)
                        || "封箱".equals(pc)
                        || "贴标".equals(pc)
                        || "packing".equals(processCode)) {
                    packagingDoneBundleIds.add(entry.getKey());
                    break;
                }
            }
        }

        List<String> targetBundleIds = new ArrayList<>();
        for (Map.Entry<String, Set<String>> entry : bundleScanTypes.entrySet()) {
            Set<String> types = entry.getValue();
            String bundleId = entry.getKey();
            switch (status) {
                case "pendingQc":
                    if (types.contains("production") && !types.contains("quality")) {
                        targetBundleIds.add(bundleId);
                    }
                    break;
                case "pendingPackaging":
                    if (Boolean.TRUE.equals(bundleQualityConfirmed.get(bundleId))
                            && !packagingDoneBundleIds.contains(bundleId)
                            && !Boolean.TRUE.equals(bundleWarehouseDone.get(bundleId))) {
                        targetBundleIds.add(bundleId);
                    }
                    break;
                case "pendingWarehouse":
                    if (Boolean.TRUE.equals(bundleQualityConfirmed.get(bundleId))
                            && !Boolean.TRUE.equals(bundleWarehouseDone.get(bundleId))
                            && (packagingDoneBundleIds.contains(bundleId)
                                || Boolean.TRUE.equals(bundleDefectiveConfirmed.get(bundleId)))) {
                        targetBundleIds.add(bundleId);
                    }
                    break;
                default:
                    break;
            }
        }

        if (targetBundleIds.isEmpty()) {
            return Collections.emptyList();
        }

        List<CuttingBundle> bundles = cuttingBundleService.listByIds(targetBundleIds);
        Map<String, CuttingBundle> bundleMap = new HashMap<>();
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b != null && StringUtils.hasText(b.getId())) {
                    bundleMap.put(b.getId().trim(), b);
                }
            }
        }

        Set<String> orderIds = new HashSet<>(bundleOrderIds.values());
        Map<String, ProductionOrder> orderMap = new HashMap<>();
        if (!orderIds.isEmpty()) {
            List<ProductionOrder> orderList = productionOrderService.listByIds(orderIds);
            for (ProductionOrder order : orderList) {
                orderMap.put(String.valueOf(order.getId()).trim(), order);
            }
            if (!orderList.isEmpty()) {
                productionOrderQueryService.fillStyleCover(orderList);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (String bundleId : targetBundleIds) {
            Map<String, Object> item = new java.util.LinkedHashMap<>();
            CuttingBundle bundle = bundleMap.get(bundleId);
            String orderId = bundleOrderIds.getOrDefault(bundleId, "");
            ProductionOrder order = orderMap.get(orderId);

            if (order != null) {
                String orderStatus = order.getStatus() == null ? "" : order.getStatus().trim().toLowerCase();
                if ("closed".equals(orderStatus)
                        || "completed".equals(orderStatus)
                        || "cancelled".equals(orderStatus)
                        || "archived".equals(orderStatus)) {
                    continue;
                }
            }

            item.put("bundleId", bundleId);
            item.put("bundleNo", bundle != null ? bundle.getBundleNo() : null);
            item.put("qrCode", bundle != null ? bundle.getQrCode() : "");
            item.put("color", bundle != null ? bundle.getColor() : "");
            item.put("size", bundle != null ? bundle.getSize() : "");
            item.put("quantity", bundleQuantities.getOrDefault(bundleId, bundle != null ? bundle.getQuantity() : 0));
            item.put("orderId", orderId);
            item.put("orderNo", bundleOrderNos.getOrDefault(bundleId, ""));
            item.put("styleNo", bundleStyleNos.getOrDefault(bundleId, bundle != null ? bundle.getStyleNo() : ""));
            item.put("styleName", order != null ? order.getStyleName() : "");
            item.put("styleCover", order != null ? order.getStyleCover() : "");
            item.put("status", status);
            result.add(item);
        }

        return result;
    }

    /**
     * 查询指定订单下各菲号的扫码就绪状态
     * 返回：qcReadyQrs（已完成车缝、尚未质检的菲号二维码列表）
     *       warehouseReadyQrs（已质检、尚未入库的菲号二维码列表）
     * 前端用于控制质检/入库页面中哪些菲号可选
     */
    public Map<String, Object> getBundleReadiness(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        String oid = orderId.trim();
        ProductionOrder order = productionOrderService.getById(oid);
        if (order != null) {
            String orderStatus = order.getStatus() == null ? "" : order.getStatus().trim().toLowerCase();
            if ("closed".equals(orderStatus)
                    || "completed".equals(orderStatus)
                    || "cancelled".equals(orderStatus)
                    || "archived".equals(orderStatus)) {
                Map<String, Object> empty = new java.util.LinkedHashMap<>();
                empty.put("qcReadyQrs", new ArrayList<>());
                empty.put("warehouseReadyQrs", new ArrayList<>());
                return empty;
            }
        }

        // 查询该订单所有关联菲号的扫码记录
        List<ScanRecord> scans;
        scans = scanRecordService.list(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getOrderId, oid)
                            .isNotNull(ScanRecord::getCuttingBundleId)
                            .ne(ScanRecord::getCuttingBundleId, "")
            );

        // 按 cuttingBundleId 分组，收集每个菲号就绪状态（只看成功记录）
        Map<String, Set<String>> bundleScanTypes = new HashMap<>();
        Map<String, Set<String>> bundleProcessCodes = new HashMap<>();
        Map<String, Boolean> bundleQualityConfirmed = new HashMap<>();
        Map<String, Boolean> bundleDefectiveConfirmed = new HashMap<>();
        Map<String, Boolean> bundleWarehouseDone = new HashMap<>();
        for (ScanRecord scan : scans) {
            String scanResult = scan.getScanResult() == null ? "" : scan.getScanResult().trim().toLowerCase();
            if (!"success".equals(scanResult)) continue;
            String bundleId = scan.getCuttingBundleId().trim();
            String scanType = scan.getScanType();
            if (!StringUtils.hasText(scanType)) continue;
            bundleScanTypes.computeIfAbsent(bundleId, k -> new HashSet<>()).add(scanType);

            String processCode = scan.getProcessCode() == null ? "" : scan.getProcessCode().trim();
            String processCodeLower = processCode.toLowerCase();
            if (StringUtils.hasText(processCode)) {
                bundleProcessCodes.computeIfAbsent(bundleId, k -> new HashSet<>()).add(processCode);
            }

            if ("quality".equals(scanType)
                    && "quality_receive".equals(processCode)
                    && scan.getConfirmTime() != null) {
                bundleQualityConfirmed.put(bundleId, true);
                String remark = scan.getRemark() == null ? "" : scan.getRemark().trim().toLowerCase();
                if (remark.startsWith("unqualified")) {
                    bundleDefectiveConfirmed.put(bundleId, true);
                }
            }

            if ("warehouse".equals(scanType)
                    && !"warehouse_rollback".equals(processCodeLower)) {
                bundleWarehouseDone.put(bundleId, true);
            }
        }

        Set<String> packagingDoneBundleIds = new HashSet<>();
        for (Map.Entry<String, Set<String>> entry : bundleProcessCodes.entrySet()) {
            for (String pc : entry.getValue()) {
                String processCode = pc == null ? "" : pc.trim().toLowerCase();
                if (processCode.contains("packaging")
                        || "包装".equals(pc)
                        || "打包".equals(pc)
                        || "入袋".equals(pc)
                        || "后整".equals(pc)
                        || "装箱".equals(pc)
                        || "封箱".equals(pc)
                        || "贴标".equals(pc)
                        || "packing".equals(processCode)) {
                    packagingDoneBundleIds.add(entry.getKey());
                    break;
                }
            }
        }

        // 分类：质检就绪 vs 入库就绪
        Set<String> qcReadyBundleIds = new HashSet<>();
        Set<String> warehouseReadyBundleIds = new HashSet<>();

        for (Map.Entry<String, Set<String>> entry : bundleScanTypes.entrySet()) {
            Set<String> types = entry.getValue();
            String bundleId = entry.getKey();
            // 质检就绪：完成车缝(production) 但还没质检(quality)
            if (types.contains("production") && !types.contains("quality")) {
                qcReadyBundleIds.add(bundleId);
            }
            // 入库就绪：已质检确认 + (已包装 或 次品返修) + 尚未成功入库
            if (Boolean.TRUE.equals(bundleQualityConfirmed.get(bundleId))
                    && !Boolean.TRUE.equals(bundleWarehouseDone.get(bundleId))
                    && (packagingDoneBundleIds.contains(bundleId)
                        || Boolean.TRUE.equals(bundleDefectiveConfirmed.get(bundleId)))) {
                warehouseReadyBundleIds.add(bundleId);
            }
        }

        // 将 bundleId 转换为 QR code
        Set<String> allIds = new HashSet<>();
        allIds.addAll(qcReadyBundleIds);
        allIds.addAll(warehouseReadyBundleIds);

        List<String> qcReadyQrs = new ArrayList<>();
        List<String> warehouseReadyQrs = new ArrayList<>();
        Map<String, String> bundleIdToQrCode = new HashMap<>();

        if (!allIds.isEmpty()) {
            List<CuttingBundle> bundles = cuttingBundleService.listByIds(new ArrayList<>(allIds));
            if (bundles != null) {
                for (CuttingBundle b : bundles) {
                    if (b == null || !StringUtils.hasText(b.getId()) || !StringUtils.hasText(b.getQrCode())) continue;
                    String bid = b.getId().trim();
                    String qr = b.getQrCode().trim();
                    bundleIdToQrCode.put(bid, qr);
                    if (qcReadyBundleIds.contains(bid)) qcReadyQrs.add(qr);
                    if (warehouseReadyBundleIds.contains(bid)) warehouseReadyQrs.add(qr);
                }
            }
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("qcReadyQrs", qcReadyQrs);
        result.put("warehouseReadyQrs", warehouseReadyQrs);

        Map<String, List<String>> bundleStageHints = new HashMap<>();
        Map<String, List<ScanRecord>> scansByBundle = new HashMap<>();
        for (ScanRecord scan : scans) {
            String scanResult = scan.getScanResult() == null ? "" : scan.getScanResult().trim().toLowerCase();
            if (!"success".equals(scanResult)) continue;
            String bid = scan.getCuttingBundleId() == null ? "" : scan.getCuttingBundleId().trim();
            if (!StringUtils.hasText(bid)) continue;
            scansByBundle.computeIfAbsent(bid, k -> new ArrayList<>()).add(scan);
        }
        if (!scansByBundle.isEmpty()) {
            List<String> allBundleIds = new ArrayList<>(scansByBundle.keySet());
            List<ProductWarehousing> allWhRecords = productWarehousingService.list(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .in(ProductWarehousing::getCuttingBundleId, allBundleIds)
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            Map<String, List<ProductWarehousing>> whByBundle = new HashMap<>();
            if (allWhRecords != null) {
                for (ProductWarehousing w : allWhRecords) {
                    String bid = w.getCuttingBundleId() == null ? "" : w.getCuttingBundleId().trim();
                    if (StringUtils.hasText(bid)) {
                        whByBundle.computeIfAbsent(bid, k -> new ArrayList<>()).add(w);
                    }
                }
            }
            for (Map.Entry<String, List<ScanRecord>> entry : scansByBundle.entrySet()) {
                String bid = entry.getKey();
                List<ProductWarehousing> whList = whByBundle.getOrDefault(bid, java.util.Collections.emptyList());
                List<String> hints = warehousingHelper.buildBundleStageHints(entry.getValue(), whList);
                if (!hints.isEmpty()) {
                    bundleStageHints.put(bid, hints);
                }
            }
        }
        Map<String, List<String>> qrStageHints = new HashMap<>();
        if (!bundleStageHints.isEmpty()) {
            for (Map.Entry<String, List<String>> entry : bundleStageHints.entrySet()) {
                String qrCode = bundleIdToQrCode.get(entry.getKey().trim());
                if (StringUtils.hasText(qrCode) && entry.getValue() != null && !entry.getValue().isEmpty()) {
                    qrStageHints.put(qrCode, entry.getValue());
                }
            }
        }
        result.put("qrStageHints", qrStageHints);
        return result;
    }

    /**
     * 质检简报：返回订单的关键信息、款式BOM、尺寸规格、质检注意事项
     * 供质检详情页右侧面板使用
     */
    public Map<String, Object> getQualityBriefing(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        Map<String, Object> briefing = new java.util.LinkedHashMap<>();

        ProductionOrder order = productionOrderService.getById(orderId.trim());
        if (order == null) {
            throw new NoSuchElementException("订单不存在");
        }
        Map<String, Object> orderInfo = new java.util.LinkedHashMap<>();
        orderInfo.put("orderNo", order.getOrderNo());
        orderInfo.put("styleNo", order.getStyleNo());
        orderInfo.put("styleName", order.getStyleName());
        orderInfo.put("orderQuantity", order.getOrderQuantity());
        orderInfo.put("color", order.getColor());
        orderInfo.put("size", order.getSize());
        orderInfo.put("factoryName", order.getFactoryName());
        orderInfo.put("merchandiser", order.getMerchandiser());
        orderInfo.put("remarks", order.getRemarks());
        orderInfo.put("orderDetails", order.getOrderDetails());
        orderInfo.put("progressWorkflowJson", order.getProgressWorkflowJson());
        orderInfo.put("styleCover", order.getStyleCover());
        briefing.put("order", orderInfo);

        String styleId = order.getStyleId();
        if (StringUtils.hasText(styleId)) {
            try {
                StyleInfo styleInfo = styleInfoService.getById(styleId.trim());
                if (styleInfo != null) {
                    Map<String, Object> styleData = new java.util.LinkedHashMap<>();
                    styleData.put("cover", styleInfo.getCover());
                    styleData.put("sizeColorConfig", styleInfo.getSizeColorConfig());
                    styleData.put("category", styleInfo.getCategory());
                    styleData.put("styleNo", styleInfo.getStyleNo());
                    styleData.put("styleName", styleInfo.getStyleName());
                    styleData.put("description", styleInfo.getDescription());
                    styleData.put("sampleReviewStatus", styleInfo.getSampleReviewStatus());
                    styleData.put("sampleReviewComment", styleInfo.getSampleReviewComment());
                    styleData.put("sampleReviewer", styleInfo.getSampleReviewer());
                    styleData.put("sampleReviewTime", styleInfo.getSampleReviewTime());
                    briefing.put("style", styleData);
                }
            } catch (Exception e) {
                log.warn("查询款式信息失败: styleId={}", styleId, e);
            }
        }

        if (StringUtils.hasText(styleId)) {
            try {
                List<StyleBom> bomList = styleBomService.list(
                        new LambdaQueryWrapper<StyleBom>().eq(StyleBom::getStyleId, styleId.trim())
                );
                briefing.put("bom", bomList != null ? bomList : Collections.emptyList());
            } catch (Exception e) {
                log.warn("查询BOM失败: styleId={}", styleId, e);
                briefing.put("bom", Collections.emptyList());
            }
        } else {
            briefing.put("bom", Collections.emptyList());
        }

        List<String> tips = new ArrayList<>();
        tips.add("请核对颜色、尺码与制单是否一致");
        tips.add("检查车缝线迹是否均匀、有无跳针断线");
        tips.add("检查面料有无破损、色差、污渍");
        tips.add("核对纽扣/拉链等辅料是否齐全牢固");
        tips.add("检查尺寸是否在允许的公差范围内");

        if (StringUtils.hasText(order.getRemarks())) {
            tips.add(0, "⚠ 订单备注: " + order.getRemarks().trim());
        }

        try {
            List<ProductWarehousing> historyDefects = productWarehousingService.list(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, orderId.trim())
                            .eq(ProductWarehousing::getQualityStatus, "unqualified")
                            .and(w -> w.eq(ProductWarehousing::getDeleteFlag, 0).or().isNull(ProductWarehousing::getDeleteFlag))
            );
            if (historyDefects != null && !historyDefects.isEmpty()) {
                tips.add(0, "⚠ 该订单已有 " + historyDefects.size() + " 条不合格记录，请重点关注质量");
                Map<String, Long> categoryCounts = new HashMap<>();
                for (ProductWarehousing d : historyDefects) {
                    String cat = TextUtils.safeText(d.getDefectCategory());
                    if (StringUtils.hasText(cat)) {
                        categoryCounts.merge(cat, 1L, Long::sum);
                    }
                }
                if (!categoryCounts.isEmpty()) {
                    String topCategory = categoryCounts.entrySet().stream()
                            .max(Map.Entry.comparingByValue())
                            .map(Map.Entry::getKey)
                            .orElse("");
                    if (StringUtils.hasText(topCategory)) {
                        // 将英文枚举 key 翻译为中文显示
                        java.util.Map<String, String> categoryLabels = new java.util.HashMap<>();
                        categoryLabels.put("appearance_integrity", "外观完整性问题");
                        categoryLabels.put("size_accuracy", "尺寸精准度问题");
                        categoryLabels.put("process_compliance", "工艺符合性问题");
                        categoryLabels.put("functional_effectiveness", "功能有效性问题");
                        categoryLabels.put("other", "其他问题");
                        String topCategoryLabel = categoryLabels.getOrDefault(topCategory, topCategory);
                        tips.add(1, "⚠ 高频次品类别: " + topCategoryLabel + " (" + categoryCounts.get(topCategory) + "次)");
                    }
                }
            }
        } catch (Exception e) {
            log.warn("查询历史次品记录失败: orderId={}", orderId, e);
        }

        briefing.put("qualityTips", tips);

        return briefing;
    }

    public ProductWarehousing getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductWarehousing warehousing = productWarehousingService.getById(key);
        if (warehousing == null || (warehousing.getDeleteFlag() != null && warehousing.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("入库记录不存在");
        }
        return warehousing;
    }
}
