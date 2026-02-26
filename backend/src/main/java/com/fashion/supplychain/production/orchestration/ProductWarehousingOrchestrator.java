package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.NoSuchElementException;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class ProductWarehousingOrchestrator {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    public IPage<ProductWarehousing> list(Map<String, Object> params) {
        IPage<ProductWarehousing> page = productWarehousingService.queryPage(params);
        // 填充缺失的显示字段（兼容旧数据）
        if (page != null && page.getRecords() != null && !page.getRecords().isEmpty()) {
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

    /**
     * 获取质检入库统计数据
     * - 全部：已质检入库的记录数和数量
     * - 待质检：裁剪完成(bundled)但尚未有质检入库记录的订单数和裁剪数量
     * - 今日完成：今天创建的质检入库记录的订单数和数量
     * - 合格/不合格：按quality_status分组
     */
    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        // 1. 已质检入库的记录（排除已删除）
        LambdaQueryWrapper<ProductWarehousing> baseWrapper = new LambdaQueryWrapper<ProductWarehousing>()
                .and(w -> w.eq(ProductWarehousing::getDeleteFlag, 0).or().isNull(ProductWarehousing::getDeleteFlag));

        List<ProductWarehousing> allRecords = productWarehousingService.list(baseWrapper);

        long totalCount = allRecords.size();
        long totalQuantity = allRecords.stream()
                .mapToLong(r -> r.getWarehousingQuantity() != null ? r.getWarehousingQuantity() : 0)
                .sum();
        long totalOrders = allRecords.stream()
                .map(r -> StringUtils.hasText(r.getOrderNo()) ? r.getOrderNo().trim() : "")
                .filter(StringUtils::hasText)
                .distinct()
                .count();

        // 合格/不合格统计
        long qualifiedCount = allRecords.stream()
                .filter(r -> !"unqualified".equalsIgnoreCase(
                        r.getQualityStatus() != null ? r.getQualityStatus().trim() : ""))
                .count();
        long qualifiedQuantity = allRecords.stream()
                .filter(r -> !"unqualified".equalsIgnoreCase(
                        r.getQualityStatus() != null ? r.getQualityStatus().trim() : ""))
                .mapToLong(r -> r.getQualifiedQuantity() != null ? r.getQualifiedQuantity() : (r.getWarehousingQuantity() != null ? r.getWarehousingQuantity() : 0))
                .sum();
        long unqualifiedCount = totalCount - qualifiedCount;
        long unqualifiedQuantity = allRecords.stream()
                .filter(r -> "unqualified".equalsIgnoreCase(
                        r.getQualityStatus() != null ? r.getQualityStatus().trim() : ""))
                .mapToLong(r -> r.getUnqualifiedQuantity() != null ? r.getUnqualifiedQuantity() : 0)
                .sum();

        // 2. 今日完成：今天创建的质检入库记录
        java.time.LocalDate today = java.time.LocalDate.now();
        LocalDateTime todayStart = today.atStartOfDay();
        LocalDateTime todayEnd = today.plusDays(1).atStartOfDay();

        long todayCount = allRecords.stream()
                .filter(r -> r.getCreateTime() != null && !r.getCreateTime().isBefore(todayStart) && r.getCreateTime().isBefore(todayEnd))
                .count();
        long todayQuantity = allRecords.stream()
                .filter(r -> r.getCreateTime() != null && !r.getCreateTime().isBefore(todayStart) && r.getCreateTime().isBefore(todayEnd))
                .mapToLong(r -> r.getWarehousingQuantity() != null ? r.getWarehousingQuantity() : 0)
                .sum();
        long todayOrders = allRecords.stream()
                .filter(r -> r.getCreateTime() != null && !r.getCreateTime().isBefore(todayStart) && r.getCreateTime().isBefore(todayEnd))
                .map(r -> StringUtils.hasText(r.getOrderNo()) ? r.getOrderNo().trim() : "")
                .filter(StringUtils::hasText)
                .distinct()
                .count();

        // 3. 待质检/待入库：基于菲号维度的扫码流转统计
        //    业务规则：裁剪→车缝(子工序全完成)→质检→包装→入库
        //    待质检 = 有production扫码 但没有quality扫码的菲号
        //    待入库 = 有quality扫码 但没有warehouse扫码的菲号
        List<ScanRecord> allBundleScans;
        allBundleScans = scanRecordService.list(
                    new LambdaQueryWrapper<ScanRecord>()
                            .isNotNull(ScanRecord::getCuttingBundleId)
                            .ne(ScanRecord::getCuttingBundleId, "")
            );

        // 按菲号分组，收集每个菲号经历的 scan_type 集合 + 数量
        java.util.Map<String, java.util.Set<String>> bundleScanTypes = new java.util.HashMap<>();
        java.util.Map<String, Integer> bundleQuantities = new java.util.HashMap<>();

        for (ScanRecord scan : allBundleScans) {
            String bundleId = scan.getCuttingBundleId().trim();
            String scanType = scan.getScanType();
            if (!StringUtils.hasText(scanType)) continue;
            bundleScanTypes.computeIfAbsent(bundleId, k -> new java.util.HashSet<>()).add(scanType);
            if (scan.getQuantity() != null && scan.getQuantity() > 0) {
                bundleQuantities.merge(bundleId, scan.getQuantity(), Math::max);
            }
        }

        long pendingQcBundles = 0;
        long pendingQcQuantity = 0;
        long pendingWarehouseBundles = 0;
        long pendingWarehouseQuantity = 0;

        for (java.util.Map.Entry<String, java.util.Set<String>> entry : bundleScanTypes.entrySet()) {
            java.util.Set<String> types = entry.getValue();
            int qty = bundleQuantities.getOrDefault(entry.getKey(), 0);

            // 待质检：完成车缝(production) 但还没有质检(quality)扫码
            if (types.contains("production") && !types.contains("quality")) {
                pendingQcBundles++;
                pendingQcQuantity += qty;
            }
            // 待入库：已质检(quality) 但还没有入库(warehouse)扫码
            if (types.contains("quality") && !types.contains("warehouse")) {
                pendingWarehouseBundles++;
                pendingWarehouseQuantity += qty;
            }
        }

        Map<String, Object> stats = new java.util.LinkedHashMap<>();
        stats.put("totalCount", totalCount);
        stats.put("totalOrders", totalOrders);
        stats.put("totalQuantity", totalQuantity);
        stats.put("qualifiedCount", qualifiedCount);
        stats.put("qualifiedQuantity", qualifiedQuantity);
        stats.put("unqualifiedCount", unqualifiedCount);
        stats.put("unqualifiedQuantity", unqualifiedQuantity);
        stats.put("todayCount", todayCount);
        stats.put("todayOrders", todayOrders);
        stats.put("todayQuantity", todayQuantity);
        stats.put("pendingQcBundles", pendingQcBundles);
        stats.put("pendingQcQuantity", pendingQcQuantity);
        stats.put("pendingWarehouseBundles", pendingWarehouseBundles);
        stats.put("pendingWarehouseQuantity", pendingWarehouseQuantity);
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

        List<ScanRecord> allBundleScans;
        allBundleScans = scanRecordService.list(
                    new LambdaQueryWrapper<ScanRecord>()
                            .isNotNull(ScanRecord::getCuttingBundleId)
                            .ne(ScanRecord::getCuttingBundleId, "")
            );

        Map<String, Set<String>> bundleScanTypes = new HashMap<>();
        Map<String, Integer> bundleQuantities = new HashMap<>();
        Map<String, String> bundleOrderIds = new HashMap<>();
        Map<String, String> bundleOrderNos = new HashMap<>();
        Map<String, String> bundleStyleNos = new HashMap<>();
        Map<String, Set<String>> bundleProcessCodes = new HashMap<>();

        for (ScanRecord scan : allBundleScans) {
            String bundleId = scan.getCuttingBundleId().trim();
            String scanType = scan.getScanType();
            if (!StringUtils.hasText(scanType)) continue;
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
            if (StringUtils.hasText(scan.getProcessCode())) {
                bundleProcessCodes.computeIfAbsent(bundleId, k -> new HashSet<>())
                        .add(scan.getProcessCode());
            }
        }

        Set<String> packagingDoneBundleIds = new HashSet<>();
        for (Map.Entry<String, Set<String>> entry : bundleProcessCodes.entrySet()) {
            for (String pc : entry.getValue()) {
                if (pc.toLowerCase().contains("packaging")) {
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
                    if (types.contains("quality") && !packagingDoneBundleIds.contains(bundleId) && !types.contains("warehouse")) {
                        targetBundleIds.add(bundleId);
                    }
                    break;
                case "pendingWarehouse":
                    if (types.contains("quality") && packagingDoneBundleIds.contains(bundleId) && !types.contains("warehouse")) {
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
            for (String oid : orderIds) {
                try {
                    ProductionOrder order = productionOrderService.getById(oid);
                    if (order != null) {
                        orderMap.put(oid.trim(), order);
                    }
                } catch (Exception e) {
                    log.warn("查询订单失败: {}", oid, e);
                }
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (String bundleId : targetBundleIds) {
            Map<String, Object> item = new java.util.LinkedHashMap<>();
            CuttingBundle bundle = bundleMap.get(bundleId);
            String orderId = bundleOrderIds.getOrDefault(bundleId, "");
            ProductionOrder order = orderMap.get(orderId);

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

        // 查询该订单所有关联菲号的扫码记录
        List<ScanRecord> scans;
        scans = scanRecordService.list(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getOrderId, orderId.trim())
                            .isNotNull(ScanRecord::getCuttingBundleId)
                            .ne(ScanRecord::getCuttingBundleId, "")
            );

        // 按 cuttingBundleId 分组，收集每个菲号经历的 scanType 集合
        Map<String, Set<String>> bundleScanTypes = new HashMap<>();
        for (ScanRecord scan : scans) {
            String bundleId = scan.getCuttingBundleId().trim();
            String scanType = scan.getScanType();
            if (!StringUtils.hasText(scanType)) continue;
            bundleScanTypes.computeIfAbsent(bundleId, k -> new HashSet<>()).add(scanType);
        }

        // 分类：质检就绪 vs 入库就绪
        Set<String> qcReadyBundleIds = new HashSet<>();
        Set<String> warehouseReadyBundleIds = new HashSet<>();

        for (Map.Entry<String, Set<String>> entry : bundleScanTypes.entrySet()) {
            Set<String> types = entry.getValue();
            // 质检就绪：完成车缝(production) 但还没质检(quality)
            if (types.contains("production") && !types.contains("quality")) {
                qcReadyBundleIds.add(entry.getKey());
            }
            // 入库就绪：已质检(quality) 但还没入库(warehouse)
            if (types.contains("quality") && !types.contains("warehouse")) {
                warehouseReadyBundleIds.add(entry.getKey());
            }
        }

        // 将 bundleId 转换为 QR code
        Set<String> allIds = new HashSet<>();
        allIds.addAll(qcReadyBundleIds);
        allIds.addAll(warehouseReadyBundleIds);

        List<String> qcReadyQrs = new ArrayList<>();
        List<String> warehouseReadyQrs = new ArrayList<>();

        if (!allIds.isEmpty()) {
            List<CuttingBundle> bundles = cuttingBundleService.listByIds(new ArrayList<>(allIds));
            if (bundles != null) {
                for (CuttingBundle b : bundles) {
                    if (b == null || !StringUtils.hasText(b.getId()) || !StringUtils.hasText(b.getQrCode())) continue;
                    String bid = b.getId().trim();
                    String qr = b.getQrCode().trim();
                    if (qcReadyBundleIds.contains(bid)) qcReadyQrs.add(qr);
                    if (warehouseReadyBundleIds.contains(bid)) warehouseReadyQrs.add(qr);
                }
            }
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("qcReadyQrs", qcReadyQrs);
        result.put("warehouseReadyQrs", warehouseReadyQrs);
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
                log.warn("查诫OM失败: styleId={}", styleId, e);
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
                        tips.add(1, "⚠ 高频次品类别: " + topCategory + " (" + categoryCounts.get(topCategory) + "次)");
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

    private void normalizeAndValidateDefectInfo(ProductWarehousing w) {
        if (w == null) {
            return;
        }
        Integer uq = w.getUnqualifiedQuantity();
        String qs = TextUtils.safeText(w.getQualityStatus());
        boolean hasUnqualified = (uq != null && uq > 0) || (qs != null && "unqualified".equalsIgnoreCase(qs));

        if (!hasUnqualified) {
            w.setDefectCategory(null);
            w.setDefectRemark(null);
            return;
        }

        String defectCategory = TextUtils.safeText(w.getDefectCategory());
        String defectRemark = TextUtils.safeText(w.getDefectRemark());

        if (!StringUtils.hasText(defectCategory)) {
            throw new IllegalArgumentException("请选择次品类别");
        }
        if (!StringUtils.hasText(defectRemark)) {
            throw new IllegalArgumentException("请选择次品处理方式");
        }

        if (!("返修".equals(defectRemark) || "报废".equals(defectRemark))) {
            throw new IllegalArgumentException("次品处理方式只能选择：返修/报废");
        }

        boolean okCategory = "appearance_integrity".equals(defectCategory)
                || "size_accuracy".equals(defectCategory)
                || "process_compliance".equals(defectCategory)
                || "functional_effectiveness".equals(defectCategory)
                || "other".equals(defectCategory);
        if (!okCategory) {
            throw new IllegalArgumentException("次品类别不合法");
        }

        w.setDefectCategory(defectCategory);
        w.setDefectRemark(defectRemark);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(ProductWarehousing productWarehousing) {
        TenantAssert.assertTenantContext(); // 入库必须有租户上下文
        if (productWarehousing == null) {
            throw new IllegalArgumentException("参数错误");
        }

        // 如果没有orderId但有orderNo，自动查找orderId
        String orderId = StringUtils.hasText(productWarehousing.getOrderId())
                ? productWarehousing.getOrderId().trim()
                : null;
        String orderNo = StringUtils.hasText(productWarehousing.getOrderNo())
                ? productWarehousing.getOrderNo().trim()
                : null;

        if (!StringUtils.hasText(orderId) && StringUtils.hasText(orderNo)) {
            ProductionOrder order = productionOrderService.getByOrderNo(orderNo);
            if (order == null || !StringUtils.hasText(order.getId())) {
                throw new IllegalArgumentException("订单不存在: " + orderNo);
            }
            productWarehousing.setOrderId(order.getId());
            orderId = order.getId();
        }

        // 如果没有cuttingBundleId，尝试通过qrCode或bundleNo查找
        String bundleId = StringUtils.hasText(productWarehousing.getCuttingBundleId())
                ? productWarehousing.getCuttingBundleId().trim()
                : null;
        String bundleQrCode = StringUtils.hasText(productWarehousing.getCuttingBundleQrCode())
                ? productWarehousing.getCuttingBundleQrCode().trim()
                : null;
        Integer bundleNo = productWarehousing.getCuttingBundleNo();

        if (!StringUtils.hasText(bundleId)) {
            CuttingBundle bundle = null;
            // 方式1：通过二维码查找
            if (StringUtils.hasText(bundleQrCode)) {
                bundle = cuttingBundleService.getByQrCode(bundleQrCode);
            }
            // 方式2：通过订单号+菲号序号查找
            if (bundle == null && StringUtils.hasText(orderNo) && bundleNo != null && bundleNo > 0) {
                bundle = cuttingBundleService.lambdaQuery()
                        .eq(CuttingBundle::getProductionOrderNo, orderNo)
                        .eq(CuttingBundle::getBundleNo, bundleNo)
                        .last("LIMIT 1")
                        .one();
            }
            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                productWarehousing.setCuttingBundleId(bundle.getId());
                // 同步填充其他菲号信息
                if (!StringUtils.hasText(bundleQrCode)) {
                    productWarehousing.setCuttingBundleQrCode(bundle.getQrCode());
                }
                if (bundleNo == null || bundleNo <= 0) {
                    productWarehousing.setCuttingBundleNo(bundle.getBundleNo());
                }
            }
        }

        normalizeAndValidateDefectInfo(productWarehousing);

        // ★ 生产前置校验：菲号必须有生产扫码记录才能入库
        validateProductionPrerequisiteForWarehousing(
                productWarehousing.getOrderId(), productWarehousing.getCuttingBundleId());

        boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(productWarehousing);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // ★ 成品SKU库存已由 ServiceImpl.saveWarehousingAndUpdateOrderInternal 内部更新，此处不再重复调用

        orderId = StringUtils.hasText(productWarehousing.getOrderId()) ? productWarehousing.getOrderId().trim()
                : null;
        if (StringUtils.hasText(orderId)) {
            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after warehousing save: orderId={}, warehousingId={}",
                        orderId,
                        productWarehousing == null ? null : productWarehousing.getId(),
                        e);
            }
            productionOrderService.recomputeProgressFromRecords(orderId);

            // 已禁用系统自动完成
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean batchSave(Map<String, Object> body) {
        TenantAssert.assertTenantContext(); // 批量入库必须有租户上下文
        String orderId = body == null ? null : (String) body.get("orderId");
        String warehouse = body == null ? null : (String) body.get("warehouse");
        String warehousingType = body == null ? null : (String) body.get("warehousingType");
        Object itemsRaw = body == null ? null : body.get("items");

        String oid = orderId == null ? null : StringUtils.trimWhitespace(orderId);
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        if (!(itemsRaw instanceof List)) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        List<?> rawList = (List<?>) itemsRaw;
        List<ProductWarehousing> list = new ArrayList<>();
        for (Object obj : rawList) {
            if (!(obj instanceof Map)) {
                continue;
            }
            Map<?, ?> m = (Map<?, ?>) obj;
            String cuttingBundleQrCode = m.get("cuttingBundleQrCode") == null ? null
                    : String.valueOf(m.get("cuttingBundleQrCode"));
            Integer qty = NumberUtils.toInt(m.get("warehousingQuantity"));
            if (!StringUtils.hasText(cuttingBundleQrCode) || qty == null || qty <= 0) {
                continue;
            }

            ProductWarehousing w = new ProductWarehousing();
            w.setOrderId(oid);
            if (StringUtils.hasText(warehouse)) {
                w.setWarehouse(warehouse);
            }
            w.setWarehousingType(StringUtils.hasText(warehousingType) ? warehousingType : "manual");
            w.setCuttingBundleQrCode(cuttingBundleQrCode);
            w.setWarehousingQuantity(qty);
            w.setQualifiedQuantity(qty);
            w.setUnqualifiedQuantity(0);
            w.setQualityStatus("qualified");
            list.add(w);
        }

        if (list.isEmpty()) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        // ★ 生产前置校验：批量入库前，检查每个菲号是否都有生产扫码记录
        for (ProductWarehousing w : list) {
            // 通过二维码查找菲号ID
            String bundleId = w.getCuttingBundleId();
            if (!StringUtils.hasText(bundleId) && StringUtils.hasText(w.getCuttingBundleQrCode())) {
                CuttingBundle b = cuttingBundleService.getByQrCode(w.getCuttingBundleQrCode());
                if (b != null) {
                    bundleId = b.getId();
                }
            }
            validateProductionPrerequisiteForWarehousing(oid, bundleId);
        }

        boolean ok = productWarehousingService.saveBatchWarehousingAndUpdateOrder(list);
        if (!ok) {
            throw new IllegalStateException("批量入库失败");
        }

        // ★ 成品SKU库存已由 ServiceImpl.saveWarehousingAndUpdateOrderInternal 内部更新，此处不再重复调用

        try {
            productionOrderOrchestrator.ensureFinanceRecordsForOrder(oid);
        } catch (Exception e) {
            log.warn("Failed to ensure finance records after warehousing batch save: orderId={}, itemsCount={}",
                    oid,
                    list == null ? 0 : list.size(),
                    e);
            scanRecordDomainService.insertOrchestrationFailure(
                    oid,
                    null,
                    null,
                    null,
                    "ensureFinanceRecords",
                    e == null ? "ensureFinanceRecords failed" : ("ensureFinanceRecords failed: " + e.getMessage()),
                    LocalDateTime.now());
        }
        try {
            productionOrderService.recomputeProgressFromRecords(oid);
        } catch (Exception ex) {
            log.warn("create: recomputeProgress失败: orderId={}, error={}", oid, ex.getMessage());
        }

        // 已禁用系统自动完成
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(ProductWarehousing productWarehousing) {
        if (productWarehousing == null || !StringUtils.hasText(productWarehousing.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductWarehousing current = productWarehousingService.getById(productWarehousing.getId().trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("入库记录不存在");
        }
        normalizeAndValidateDefectInfo(productWarehousing);
        boolean ok = productWarehousingService.updateWarehousingAndUpdateOrder(productWarehousing);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // ★ 成品SKU库存已由 ServiceImpl.updateWarehousingAndUpdateOrder 内部处理差量更新，此处不再重复调用

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;
        if (StringUtils.hasText(orderId)) {
            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after warehousing update: orderId={}, warehousingId={}",
                        orderId,
                        productWarehousing == null ? null : productWarehousing.getId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId,
                        null,
                        null,
                        null,
                        "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed"
                                : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
            try {
                productionOrderService.recomputeProgressFromRecords(orderId);
            } catch (Exception ex) {
                log.warn("update: recomputeProgress失败: orderId={}, error={}", orderId, ex.getMessage());
            }

            // 已禁用系统自动完成
        }
        return true;
    }

    private void updateSkuStock(ProductWarehousing w, ProductionOrder order, CuttingBundle bundle, int deltaQuantity) {
        if (deltaQuantity == 0) {
            return;
        }
        try {
            String styleNo = w.getStyleNo();
            String color = null;
            String size = null;

            if (bundle != null) {
                color = bundle.getColor();
                size = bundle.getSize();
            } else if (order != null) {
                color = order.getColor();
                size = order.getSize();
            }

            // 如果bundle为null，尝试根据cuttingBundleId加载
            if (color == null && StringUtils.hasText(w.getCuttingBundleId())) {
                try {
                    CuttingBundle b = cuttingBundleService.getById(w.getCuttingBundleId());
                    if (b != null) {
                        color = b.getColor();
                        size = b.getSize();
                    }
                } catch (Exception ignored) {
                }
            }

            if (StringUtils.hasText(styleNo) && StringUtils.hasText(color) && StringUtils.hasText(size)) {
                String skuCode = String.format("%s-%s-%s", styleNo.trim(), color.trim(), size.trim());
                productSkuService.updateStock(skuCode, deltaQuantity);
            }
        } catch (Exception e) {
            log.warn("Failed to update SKU stock in orchestrator: warehousingId={}, delta={}, error={}", w.getId(),
                    deltaQuantity, e.getMessage());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductWarehousing current = productWarehousingService.getById(key);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("入库记录不存在");
        }

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;

        ProductWarehousing patch = new ProductWarehousing();
        patch.setId(key);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        boolean ok = productWarehousingService.updateById(patch);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }

        // Decrement Stock
        if (current.getQualifiedQuantity() != null && current.getQualifiedQuantity() > 0) {
            updateSkuStock(current, null, null, -current.getQualifiedQuantity());
        }

        if (StringUtils.hasText(orderId)) {
            try {
                int qualifiedSum = productWarehousingService.sumQualifiedByOrderId(orderId);
                ProductionOrder orderPatch = new ProductionOrder();
                orderPatch.setId(orderId);
                orderPatch.setCompletedQuantity(qualifiedSum);
                orderPatch.setUpdateTime(LocalDateTime.now());
                productionOrderService.updateById(orderPatch);
            } catch (Exception e) {
                log.warn(
                        "Failed to update production order completed quantity after warehousing delete: orderId={}, warehousingId={}",
                        orderId,
                        key,
                        e);
            }

            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after warehousing delete: orderId={}, warehousingId={}",
                        orderId,
                        key,
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId,
                        null,
                        null,
                        null,
                        "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed"
                                : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }

            try {
                productionOrderService.recomputeProgressFromRecords(orderId);
            } catch (Exception e) {
                log.warn("Failed to recompute progress after warehousing delete: orderId={}, warehousingId={}",
                        orderId,
                        key,
                        e);
            }
        }
        return true;
    }

    public Map<String, Object> repairStats(Map<String, Object> params) {
        String orderId = params == null ? null : String.valueOf(params.getOrDefault("orderId", ""));
        String cuttingBundleQrCode = params == null ? null
                : String.valueOf(params.getOrDefault("cuttingBundleQrCode", ""));
        String excludeWarehousingId = params == null ? null
                : String.valueOf(params.getOrDefault("excludeWarehousingId", ""));

        String oid = TextUtils.safeText(orderId);
        String qr = TextUtils.safeText(cuttingBundleQrCode);
        String exId = TextUtils.safeText(excludeWarehousingId);

        if (!StringUtils.hasText(qr)) {
            throw new IllegalArgumentException("cuttingBundleQrCode不能为空");
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(qr);
        if (bundle == null || !StringUtils.hasText(bundle.getId())) {
            throw new NoSuchElementException("未找到对应的裁剪扎号");
        }
        if (!StringUtils.hasText(oid)) {
            oid = StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim() : null;
        }
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("未匹配到订单");
        }
        String bundleOid = StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim()
                : null;
        if (bundleOid != null && !bundleOid.isEmpty() && !bundleOid.equals(oid)) {
            throw new IllegalArgumentException("扎号与订单不匹配");
        }

        List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                .select(ProductWarehousing::getId, ProductWarehousing::getUnqualifiedQuantity,
                        ProductWarehousing::getQualifiedQuantity, ProductWarehousing::getRepairRemark)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .eq(ProductWarehousing::getOrderId, oid)
                .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                .ne(StringUtils.hasText(exId), ProductWarehousing::getId, exId)
                .orderByDesc(ProductWarehousing::getCreateTime));

        long repairPool = 0;
        long repairedOut = 0;
        if (list != null) {
            for (ProductWarehousing w : list) {
                if (w == null) {
                    continue;
                }
                int uq = w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity();
                if (uq > 0) {
                    repairPool += uq;
                }

                String rr = TextUtils.safeText(w.getRepairRemark());
                if (rr != null) {
                    int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                    if (q > 0) {
                        repairedOut += q;
                    }
                }
            }
        }
        long remaining = repairPool - repairedOut;

        Map<String, Object> data = new HashMap<>();
        data.put("orderId", oid);
        data.put("cuttingBundleId", bundle.getId());
        data.put("cuttingBundleQrCode", qr);
        data.put("repairPool", Math.max(0, repairPool));
        data.put("repairedOut", Math.max(0, repairedOut));
        data.put("remaining", remaining <= 0 ? 0 : remaining);
        return data;
    }

    public Map<String, Object> batchRepairStats(Map<String, Object> body) {
        Object orderIdRaw = body == null ? null : body.get("orderId");
        String orderId = orderIdRaw == null ? null : String.valueOf(orderIdRaw);
        String oid = TextUtils.safeText(orderId);
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        Object qrsRaw = body == null ? null : body.get("qrs");
        List<?> qrsList = qrsRaw instanceof List<?> l ? l : Collections.emptyList();
        List<String> qrs = new ArrayList<>();
        for (Object v : qrsList) {
            String s = v == null ? null : String.valueOf(v).trim();
            if (StringUtils.hasText(s)) {
                qrs.add(s);
            }
        }
        if (qrs.isEmpty()) {
            Map<String, Object> resp = new HashMap<>();
            resp.put("items", new ArrayList<>());
            return resp;
        }

        Object excludeWarehousingIdRaw = body == null ? null : body.get("excludeWarehousingId");
        String excludeWarehousingId = excludeWarehousingIdRaw == null ? null : String.valueOf(excludeWarehousingIdRaw);
        String exId = TextUtils.safeText(excludeWarehousingId);

        List<CuttingBundle> bundles = cuttingBundleService.lambdaQuery()
                .select(CuttingBundle::getId, CuttingBundle::getQrCode, CuttingBundle::getProductionOrderId)
                .in(CuttingBundle::getQrCode, qrs)
                .list();
        Map<String, CuttingBundle> bundleByQr = new HashMap<>();
        List<String> bundleIds = new ArrayList<>();
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b == null) {
                    continue;
                }
                String qr = StringUtils.hasText(b.getQrCode()) ? b.getQrCode().trim() : null;
                String bid = StringUtils.hasText(b.getId()) ? b.getId().trim() : null;
                if (!StringUtils.hasText(qr) || !StringUtils.hasText(bid)) {
                    continue;
                }
                bundleByQr.put(qr, b);
                bundleIds.add(bid);
            }
        }

        Map<String, long[]> statsByBundleId = new HashMap<>();
        if (!bundleIds.isEmpty()) {
            List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                    .select(ProductWarehousing::getId, ProductWarehousing::getCuttingBundleId,
                            ProductWarehousing::getUnqualifiedQuantity, ProductWarehousing::getQualifiedQuantity,
                            ProductWarehousing::getRepairRemark)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .eq(ProductWarehousing::getOrderId, oid)
                    .in(ProductWarehousing::getCuttingBundleId, bundleIds)
                    .ne(StringUtils.hasText(exId), ProductWarehousing::getId, exId));
            if (list != null) {
                for (ProductWarehousing w : list) {
                    if (w == null) {
                        continue;
                    }
                    String bid = StringUtils.hasText(w.getCuttingBundleId()) ? w.getCuttingBundleId().trim() : null;
                    if (!StringUtils.hasText(bid)) {
                        continue;
                    }
                    long[] agg = statsByBundleId.computeIfAbsent(bid, k -> new long[] { 0, 0 });
                    int uq = w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity();
                    if (uq > 0) {
                        agg[0] += uq;
                    }
                    String rr = TextUtils.safeText(w.getRepairRemark());
                    if (rr != null) {
                        int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                        if (q > 0) {
                            agg[1] += q;
                        }
                    }
                }
            }
        }

        List<Map<String, Object>> items = new ArrayList<>();
        for (String qr : qrs) {
            CuttingBundle b = bundleByQr.get(qr);
            String bid = b == null ? null : (StringUtils.hasText(b.getId()) ? b.getId().trim() : null);
            String bundleOid = b == null ? null
                    : (StringUtils.hasText(b.getProductionOrderId()) ? b.getProductionOrderId().trim() : null);
            boolean mismatch = bundleOid != null && !bundleOid.isEmpty() && !bundleOid.equals(oid);

            long pool = 0;
            long out = 0;
            long remain = 0;
            if (mismatch || bid == null) {
                pool = 0;
                out = 0;
                remain = 0;
            } else {
                long[] agg = statsByBundleId.get(bid);
                pool = agg == null ? 0 : Math.max(0, agg[0]);
                out = agg == null ? 0 : Math.max(0, agg[1]);
                remain = pool - out;
                if (remain < 0) {
                    remain = 0;
                }
            }

            Map<String, Object> m = new HashMap<>();
            m.put("qr", qr);
            m.put("cuttingBundleId", bid);
            m.put("repairPool", pool);
            m.put("repairedOut", out);
            m.put("remaining", remain);
            items.add(m);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("orderId", oid);
        resp.put("items", items);
        return resp;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean rollbackByBundle(Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限回退");
        }

        Object orderIdRaw = body == null ? null : body.get("orderId");
        String orderId = orderIdRaw == null ? "" : String.valueOf(orderIdRaw).trim();

        Object cuttingBundleQrCodeRaw = body == null ? null : body.get("cuttingBundleQrCode");
        String cuttingBundleQrCode = cuttingBundleQrCodeRaw == null ? ""
                : String.valueOf(cuttingBundleQrCodeRaw).trim();
        Integer qty = NumberUtils.toInt(body == null ? null : body.get("rollbackQuantity"));
        Object remarkRaw = body == null ? null : body.get("rollbackRemark");
        String remark = remarkRaw == null ? "" : String.valueOf(remarkRaw).trim();

        if (!StringUtils.hasText(cuttingBundleQrCode)) {
            throw new IllegalArgumentException("cuttingBundleQrCode不能为空");
        }

        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("rollbackQuantity参数错误");
        }
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("请填写问题点");
        }

        boolean ok = rollbackQualifiedByBundleQrCode(orderId, cuttingBundleQrCode, qty, remark);
        if (!ok) {
            throw new IllegalStateException("回退失败");
        }

        if (StringUtils.hasText(orderId)) {
            String oid = orderId.trim();
            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(oid);
            } catch (Exception e) {
                log.warn(
                        "Failed to ensure finance records after warehousing rollback: orderId={}, cuttingBundleQrCode={}",
                        oid,
                        cuttingBundleQrCode,
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        oid,
                        null,
                        null,
                        null,
                        "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed"
                                : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
            productionOrderService.recomputeProgressFromRecords(oid);
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    private boolean rollbackQualifiedByBundleQrCode(String orderId, String cuttingBundleQrCode,
            Integer rollbackQuantity,
            String rollbackRemark) {
        String qr = StringUtils.hasText(cuttingBundleQrCode) ? cuttingBundleQrCode.trim() : null;
        if (!StringUtils.hasText(qr)) {
            throw new IllegalArgumentException("请扫码对应扎号二维码");
        }

        int rq = rollbackQuantity == null ? 0 : rollbackQuantity;
        if (rq <= 0) {
            throw new IllegalArgumentException("回退数量必须大于0");
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(qr);
        if (bundle == null || !StringUtils.hasText(bundle.getId())) {
            throw new NoSuchElementException("未找到对应的裁剪扎号");
        }

        String oid = StringUtils.hasText(orderId) ? orderId.trim()
                : (StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim() : null);
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("未匹配到订单");
        }
        String bundleOid = StringUtils.hasText(bundle.getProductionOrderId()) ? bundle.getProductionOrderId().trim()
                : null;
        if (bundleOid != null && !bundleOid.isEmpty() && !bundleOid.equals(oid)) {
            throw new IllegalArgumentException("扎号与订单不匹配");
        }

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }

        List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, oid)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                .orderByDesc(ProductWarehousing::getCreateTime));
        if (list == null || list.isEmpty()) {
            throw new NoSuchElementException("未找到该扎号对应的入库记录");
        }

        long available = 0;
        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
            if (q > 0) {
                available += q;
            }
        }
        if (available < rq) {
            throw new IllegalArgumentException("回退数量超过该扎号已入库合格数量");
        }

        LocalDateTime now = LocalDateTime.now();
        int remaining = rq;
        for (ProductWarehousing w : list) {
            if (remaining <= 0) {
                break;
            }
            if (w == null || !StringUtils.hasText(w.getId())) {
                continue;
            }
            int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
            if (q <= 0) {
                continue;
            }

            if (q <= remaining) {
                ProductWarehousing patch = new ProductWarehousing();
                patch.setId(w.getId());
                patch.setDeleteFlag(1);
                patch.setUpdateTime(now);
                productWarehousingService.updateById(patch);
                remaining -= q;

                // Decrement Stock
                if (q > 0) {
                    updateSkuStock(w, null, bundle, -q);
                }
            } else {
                int nextQualified = q - remaining;
                int whQty = w.getWarehousingQuantity() == null ? q : w.getWarehousingQuantity();
                int nextWhQty = Math.max(0, whQty - remaining);

                ProductWarehousing patch = new ProductWarehousing();
                patch.setId(w.getId());
                patch.setQualifiedQuantity(nextQualified);
                patch.setWarehousingQuantity(nextWhQty);
                patch.setUpdateTime(now);
                productWarehousingService.updateById(patch);

                // Decrement Stock
                if (remaining > 0) {
                    updateSkuStock(w, null, bundle, -remaining);
                }

                remaining = 0;
            }
        }

        int qualifiedSum = productWarehousingService.sumQualifiedByOrderId(oid);
        ProductionOrder orderPatch = new ProductionOrder();
        orderPatch.setId(oid);
        orderPatch.setCompletedQuantity(qualifiedSum);
        if ("completed".equals(String.valueOf(order.getStatus()))
                && (order.getOrderQuantity() == null || qualifiedSum < order.getOrderQuantity())) {
            // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL
            LambdaUpdateWrapper<ProductionOrder> undoCompleteUw = new LambdaUpdateWrapper<>();
            undoCompleteUw.eq(ProductionOrder::getId, oid)
                          .set(ProductionOrder::getCompletedQuantity, qualifiedSum)
                          .set(ProductionOrder::getStatus, "production")
                          .set(ProductionOrder::getActualEndDate, null)
                          .set(ProductionOrder::getUpdateTime, now);
            productionOrderService.update(undoCompleteUw);
        } else {
            orderPatch.setUpdateTime(now);
            productionOrderService.updateById(orderPatch);
        }

        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();
        String remark = StringUtils.hasText(rollbackRemark) ? rollbackRemark.trim() : "";

        ScanRecord rollbackLog = new ScanRecord();
        rollbackLog.setId(UUID.randomUUID().toString());
        rollbackLog.setScanCode(qr);
        rollbackLog.setRequestId("WAREHOUSING_ROLLBACK:" + UUID.randomUUID().toString());
        rollbackLog.setOrderId(oid);
        rollbackLog.setOrderNo(order.getOrderNo());
        rollbackLog.setStyleId(order.getStyleId());
        rollbackLog.setStyleNo(order.getStyleNo());
        rollbackLog.setColor(bundle.getColor());
        rollbackLog.setSize(bundle.getSize());
        rollbackLog.setQuantity(rq);
        rollbackLog.setProcessCode("warehouse_rollback");
        rollbackLog.setProcessName("入库回退");
        rollbackLog.setOperatorId(TextUtils.safeText(operatorId));
        rollbackLog.setOperatorName(TextUtils.safeText(operatorName));
        rollbackLog.setScanTime(now);
        rollbackLog.setScanType("warehouse");
        rollbackLog.setScanResult("success");
        rollbackLog.setRemark(StringUtils.hasText(remark) ? ("入库回退：" + remark) : "入库回退");
        rollbackLog.setCuttingBundleId(bundle.getId());
        rollbackLog.setCuttingBundleNo(bundle.getBundleNo());
        rollbackLog.setCuttingBundleQrCode(bundle.getQrCode());
        rollbackLog.setCreateTime(now);
        rollbackLog.setUpdateTime(now);
        scanRecordService.save(rollbackLog);

        try {
            List<ScanRecord> warehouseScans = scanRecordService.listByCondition(
                    oid, bundle.getId(), "warehouse", "success", "warehouse_rollback");
            if (warehouseScans != null) {
                List<ScanRecord> toUpdate = new ArrayList<>();
                for (ScanRecord sr : warehouseScans) {
                    if (sr == null || !StringUtils.hasText(sr.getId())) {
                        continue;
                    }
                    ScanRecord patch = new ScanRecord();
                    patch.setId(sr.getId());
                    patch.setScanResult("failure");
                    patch.setRemark("入库记录已回退作废");
                    patch.setUpdateTime(now);
                    toUpdate.add(patch);
                }
                if (!toUpdate.isEmpty()) {
                    scanRecordService.batchUpdateRecords(toUpdate);
                }
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to mark previous warehouse scan records invalid after rollback: orderId={}, cuttingBundleId={}",
                    oid,
                    bundle == null ? null : bundle.getId(),
                    e);
        }

        try {
            List<ScanRecord> inspectionRecords = scanRecordService.listQualityWarehousingRecords(oid, bundle.getId());
            if (inspectionRecords != null) {
                List<ScanRecord> toUpdate = new ArrayList<>();
                for (ScanRecord sr : inspectionRecords) {
                    if (sr == null || !StringUtils.hasText(sr.getId())) {
                        continue;
                    }
                    ScanRecord patch = new ScanRecord();
                    patch.setId(sr.getId());
                    patch.setScanResult("failure");
                    patch.setRemark("质检入库已回退作废");
                    patch.setUpdateTime(now);
                    toUpdate.add(patch);
                }
                if (!toUpdate.isEmpty()) {
                    scanRecordService.batchUpdateRecords(toUpdate);
                }
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to mark previous inspection scan records invalid after rollback: orderId={}, cuttingBundleId={}",
                    oid,
                    bundle == null ? null : bundle.getId(),
                    e);
        }

        return true;
    }

    /**
     * 验证质检前置条件：该菲号必须有生产扫码记录才能进行质检入库
     * 业务规则：车缝等生产工序完成 → 质检（合格/不合格）→ 包装 → 入库
     * PC端质检入库接口（save/batchSave）使用此校验，不检查包装（包装在质检之后）
     * ⚠️ 小程序仓库扫码入库使用 WarehouseScanExecutor.validateProductionPrerequisite，
     *    那里才需要检查包装完成。两个校验职责不同，请勿混淆。
     */
    private void validateProductionPrerequisiteForWarehousing(String orderId, String bundleId) {
        if (!StringUtils.hasText(orderId) || !StringUtils.hasText(bundleId)) {
            return;
        }
        try {
            // 基础检查：至少有生产扫码记录（车缝等子工序完成即可做质检）
            long productionCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, "success"));
            if (productionCount <= 0) {
                throw new IllegalStateException("温馨提示：该菲号还未完成生产扫码哦～请先完成车缝等生产工序后再质检");
            }
            // ✅ 不检查包装：质检操作在包装之前，车缝子工序扫码完成即可质检
            // ✅ 包装检查仅在 WarehouseScanExecutor（小程序入库扫码）中执行
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("检查质检前置条件失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }
    }

    // 使用TextUtils.safeText()和NumberUtils.toInt()替代
}
