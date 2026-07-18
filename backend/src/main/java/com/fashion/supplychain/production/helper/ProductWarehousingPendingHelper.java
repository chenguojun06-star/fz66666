package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
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
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

@Service
@Slf4j
public class ProductWarehousingPendingHelper {

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

    public List<Map<String, Object>> listPendingBundles(String status, String orderId) {
        if (!StringUtils.hasText(status)) {
            throw new IllegalArgumentException("status参数不能为空");
        }
        Long tenantId = UserContext.tenantId();
        List<ScanRecord> allBundleScans;
        if (StringUtils.hasText(orderId)) {
            allBundleScans = queryOrderBundleScans(orderId.trim());
        } else {
            allBundleScans = queryBundleScans(tenantId);
        }

        BundleScanAggregation agg = aggregateBundleScans(allBundleScans);
        Set<String> packagingDoneBundleIds = findPackagingDoneBundles(agg.bundleProcessCodes);
        List<String> targetBundleIds = filterBundlesByStatus(status, agg.bundleScanTypes,
                agg.bundleQualityConfirmed, agg.bundleDefectiveConfirmed,
                agg.bundleWarehouseDone, packagingDoneBundleIds);

        if (targetBundleIds.isEmpty()) {
            return Collections.emptyList();
        }
        return buildPendingBundleResult(targetBundleIds, agg);
    }

    public Map<String, Object> getBundleReadiness(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        String oid = orderId.trim();
        try {
            ProductionOrder order = productionOrderService.getById(oid);
            if (order != null) {
                String orderStatus = order.getStatus() == null ? "" : order.getStatus().trim().toLowerCase();
                if (OrderStatusConstants.isTerminal(orderStatus)) {
                    return buildEmptyReadiness();
                }
            }
            List<ScanRecord> scans = queryOrderBundleScans(oid);
            BundleScanAggregation agg = aggregateBundleScans(scans);
            Set<String> packagingDoneBundleIds = findPackagingDoneBundles(agg.bundleProcessCodes);
            ReadinessSets readiness = resolveReadinessSets(agg, packagingDoneBundleIds);
            Map<String, String> bundleIdToQrCode = resolveQrCodes(readiness);
            List<String> qcReadyQrs = new ArrayList<>();
            List<String> warehouseReadyQrs = new ArrayList<>();
            for (String bid : readiness.qcReadyBundleIds) {
                String qr = bundleIdToQrCode.get(bid);
                if (StringUtils.hasText(qr)) qcReadyQrs.add(qr);
            }
            for (String bid : readiness.warehouseReadyBundleIds) {
                String qr = bundleIdToQrCode.get(bid);
                if (StringUtils.hasText(qr)) warehouseReadyQrs.add(qr);
            }
            Map<String, List<String>> qrStageHints = buildQrStageHints(scans, agg, bundleIdToQrCode);
            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("qcReadyQrs", qcReadyQrs);
            result.put("warehouseReadyQrs", warehouseReadyQrs);
            result.put("qrStageHints", qrStageHints);
            return result;
        } catch (Exception e) {
            log.error("getBundleReadiness failed: orderId={}, error={}", oid, e.getMessage(), e);
            return buildEmptyReadiness();
        }
    }

    public Map<String, Object> getQualityBriefing(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        Map<String, Object> briefing = new java.util.LinkedHashMap<>();

        ProductionOrder order = productionOrderService.getById(orderId.trim());
        if (order == null) {
            throw new NoSuchElementException("订单不存在");
        }
        briefing.put("order", buildOrderInfo(order));

        String styleId = order.getStyleId();
        // 提前查询 StyleInfo 实体，供 buildStyleInfo 和 buildQualityTips 共用，避免重复查询
        StyleInfo styleInfo = fetchStyleInfoEntity(styleId);
        briefing.put("style", buildStyleInfo(styleInfo));
        List<StyleBom> bomList = buildBomList(styleId);
        briefing.put("bom", bomList);
        briefing.put("qualityTips", buildQualityTips(orderId, order, styleInfo, bomList));

        return briefing;
    }

    private List<ScanRecord> queryBundleScans(Long tenantId) {
        LambdaQueryWrapper<ScanRecord> q = new LambdaQueryWrapper<ScanRecord>()
                .isNotNull(ScanRecord::getCuttingBundleId)
                .ne(ScanRecord::getCuttingBundleId, "")
                .ne(ScanRecord::getScanType, "orchestration")
                .eq(ScanRecord::getScanResult, "success");
        if (tenantId != null) {
            q.eq(ScanRecord::getTenantId, tenantId);
        }
        return scanRecordService.list(q);
    }

    private static class BundleScanAggregation {
        Map<String, Set<String>> bundleScanTypes = new HashMap<>();
        Map<String, Integer> bundleQuantities = new HashMap<>();
        Map<String, String> bundleOrderIds = new HashMap<>();
        Map<String, String> bundleOrderNos = new HashMap<>();
        Map<String, String> bundleStyleNos = new HashMap<>();
        Map<String, Set<String>> bundleProcessCodes = new HashMap<>();
        Map<String, Boolean> bundleQualityConfirmed = new HashMap<>();
        Map<String, Boolean> bundleDefectiveConfirmed = new HashMap<>();
        Map<String, Boolean> bundleWarehouseDone = new HashMap<>();
    }

    private BundleScanAggregation aggregateBundleScans(List<ScanRecord> allBundleScans) {
        BundleScanAggregation agg = new BundleScanAggregation();
        for (ScanRecord scan : allBundleScans) {
            String bundleId = scan.getCuttingBundleId().trim();
            String scanType = scan.getScanType();
            if (!StringUtils.hasText(scanType)) continue;
            String scanResult = scan.getScanResult() == null ? "" : scan.getScanResult().trim().toLowerCase();
            if (!"success".equals(scanResult)) continue;
            String processCode = scan.getProcessCode() == null ? "" : scan.getProcessCode().trim();
            String processCodeLower = processCode.toLowerCase();
            agg.bundleScanTypes.computeIfAbsent(bundleId, k -> new HashSet<>()).add(scanType);
            if (scan.getQuantity() != null && scan.getQuantity() > 0) {
                agg.bundleQuantities.merge(bundleId, scan.getQuantity(), Math::max);
            }
            if (StringUtils.hasText(scan.getOrderId())) agg.bundleOrderIds.putIfAbsent(bundleId, scan.getOrderId().trim());
            if (StringUtils.hasText(scan.getOrderNo())) agg.bundleOrderNos.putIfAbsent(bundleId, scan.getOrderNo().trim());
            if (StringUtils.hasText(scan.getStyleNo())) agg.bundleStyleNos.putIfAbsent(bundleId, scan.getStyleNo().trim());
            if (StringUtils.hasText(processCode)) agg.bundleProcessCodes.computeIfAbsent(bundleId, k -> new HashSet<>()).add(processCode);
            if ("quality".equals(scanType) && "quality_receive".equals(processCode) && scan.getConfirmTime() != null) {
                agg.bundleQualityConfirmed.put(bundleId, true);
                String remark = scan.getRemark() == null ? "" : scan.getRemark().trim().toLowerCase();
                if (remark.startsWith("unqualified")) agg.bundleDefectiveConfirmed.put(bundleId, true);
            }
            if ("warehouse".equals(scanType) && !"warehouse_rollback".equals(processCodeLower)) {
                agg.bundleWarehouseDone.put(bundleId, true);
            }
        }
        return agg;
    }

    private Set<String> findPackagingDoneBundles(Map<String, Set<String>> bundleProcessCodes) {
        Set<String> packagingDoneBundleIds = new HashSet<>();
        for (Map.Entry<String, Set<String>> entry : bundleProcessCodes.entrySet()) {
            for (String pc : entry.getValue()) {
                String processCode = pc == null ? "" : pc.trim().toLowerCase();
                if (processCode.contains("packaging") || "包装".equals(pc) || "打包".equals(pc)
                        || "入袋".equals(pc) || "后整".equals(pc) || "装箱".equals(pc)
                        || "封箱".equals(pc) || "贴标".equals(pc) || "packing".equals(processCode)) {
                    packagingDoneBundleIds.add(entry.getKey());
                    break;
                }
            }
        }
        return packagingDoneBundleIds;
    }

    private List<String> filterBundlesByStatus(String status, Map<String, Set<String>> bundleScanTypes,
            Map<String, Boolean> bundleQualityConfirmed, Map<String, Boolean> bundleDefectiveConfirmed,
            Map<String, Boolean> bundleWarehouseDone, Set<String> packagingDoneBundleIds) {
        List<String> targetBundleIds = new ArrayList<>();
        for (Map.Entry<String, Set<String>> entry : bundleScanTypes.entrySet()) {
            Set<String> types = entry.getValue();
            String bundleId = entry.getKey();
            switch (status) {
                case "pendingQc":
                    if (types.contains("production") && !types.contains("quality")) targetBundleIds.add(bundleId);
                    break;
                case "pendingPackaging":
                    if (Boolean.TRUE.equals(bundleQualityConfirmed.get(bundleId))
                            && !packagingDoneBundleIds.contains(bundleId)
                            && !Boolean.TRUE.equals(bundleWarehouseDone.get(bundleId))) targetBundleIds.add(bundleId);
                    break;
                case "pendingWarehouse":
                    if (Boolean.TRUE.equals(bundleQualityConfirmed.get(bundleId))
                            && !Boolean.TRUE.equals(bundleWarehouseDone.get(bundleId))
                            && (packagingDoneBundleIds.contains(bundleId)
                                || Boolean.TRUE.equals(bundleDefectiveConfirmed.get(bundleId)))) targetBundleIds.add(bundleId);
                    break;
                default: break;
            }
        }
        return targetBundleIds;
    }

    private List<Map<String, Object>> buildPendingBundleResult(List<String> targetBundleIds, BundleScanAggregation agg) {
        List<CuttingBundle> bundles = cuttingBundleService.listByIds(targetBundleIds);
        Map<String, CuttingBundle> bundleMap = new HashMap<>();
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b != null && StringUtils.hasText(b.getId())) bundleMap.put(b.getId().trim(), b);
            }
        }
        Set<String> orderIds = new HashSet<>(agg.bundleOrderIds.values());
        Map<String, ProductionOrder> orderMap = loadOrdersWithCover(orderIds);
        List<Map<String, Object>> result = new ArrayList<>();
        for (String bundleId : targetBundleIds) {
            CuttingBundle bundle = bundleMap.get(bundleId);
            String orderId = agg.bundleOrderIds.getOrDefault(bundleId, "");
            ProductionOrder order = orderMap.get(orderId);
            if (order != null) {
                String orderStatus = order.getStatus() == null ? "" : order.getStatus().trim().toLowerCase();
                if (OrderStatusConstants.isTerminal(orderStatus)) continue;
            }
            Map<String, Object> item = new java.util.LinkedHashMap<>();
            item.put("bundleId", bundleId);
            item.put("bundleNo", bundle != null ? bundle.getBundleNo() : null);
            item.put("qrCode", bundle != null ? bundle.getQrCode() : "");
            item.put("color", bundle != null ? bundle.getColor() : "");
            item.put("size", bundle != null ? bundle.getSize() : "");
            item.put("quantity", agg.bundleQuantities.getOrDefault(bundleId, bundle != null ? bundle.getQuantity() : 0));
            item.put("orderId", orderId);
            item.put("orderNo", agg.bundleOrderNos.getOrDefault(bundleId, ""));
            item.put("styleNo", agg.bundleStyleNos.getOrDefault(bundleId, bundle != null ? bundle.getStyleNo() : ""));
            item.put("styleName", order != null ? order.getStyleName() : "");
            item.put("styleCover", order != null ? order.getStyleCover() : "");
            item.put("factoryName", order != null ? order.getFactoryName() : "");
            item.put("factoryType", order != null ? order.getFactoryType() : "");
            item.put("plannedEndDate", order != null ? order.getPlannedEndDate() : null);
            item.put("status", order != null ? order.getStatus() : "");
            result.add(item);
        }
        return result;
    }

    private Map<String, ProductionOrder> loadOrdersWithCover(Set<String> orderIds) {
        Map<String, ProductionOrder> orderMap = new HashMap<>();
        if (orderIds.isEmpty()) return orderMap;
        List<ProductionOrder> orderList = productionOrderService.listByIds(orderIds);
        for (ProductionOrder order : orderList) {
            orderMap.put(String.valueOf(order.getId()).trim(), order);
        }
        if (!orderList.isEmpty()) {
            productionOrderQueryService.fillStyleCover(orderList);
        }
        return orderMap;
    }

    private Map<String, Object> buildEmptyReadiness() {
        Map<String, Object> empty = new java.util.LinkedHashMap<>();
        empty.put("qcReadyQrs", new ArrayList<>());
        empty.put("warehouseReadyQrs", new ArrayList<>());
        empty.put("qrStageHints", new HashMap<>());
        return empty;
    }

    private List<ScanRecord> queryOrderBundleScans(String oid) {
        return scanRecordService.list(
                new LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getOrderId, oid)
                        .isNotNull(ScanRecord::getCuttingBundleId)
                        .ne(ScanRecord::getCuttingBundleId, "")
                        .ne(ScanRecord::getScanType, "orchestration")
                        .eq(ScanRecord::getScanResult, "success"));
    }

    private static class ReadinessSets {
        Set<String> qcReadyBundleIds = new HashSet<>();
        Set<String> warehouseReadyBundleIds = new HashSet<>();
        Set<String> allIds = new HashSet<>();
    }

    private ReadinessSets resolveReadinessSets(BundleScanAggregation agg, Set<String> packagingDoneBundleIds) {
        ReadinessSets rs = new ReadinessSets();
        for (Map.Entry<String, Set<String>> entry : agg.bundleScanTypes.entrySet()) {
            Set<String> types = entry.getValue();
            String bundleId = entry.getKey();
            if (types.contains("production") && !types.contains("quality")) {
                rs.qcReadyBundleIds.add(bundleId);
            }
            if (Boolean.TRUE.equals(agg.bundleQualityConfirmed.get(bundleId))
                    && !Boolean.TRUE.equals(agg.bundleWarehouseDone.get(bundleId))
                    && (packagingDoneBundleIds.contains(bundleId)
                        || Boolean.TRUE.equals(agg.bundleDefectiveConfirmed.get(bundleId)))) {
                rs.warehouseReadyBundleIds.add(bundleId);
            }
        }
        rs.allIds.addAll(rs.qcReadyBundleIds);
        rs.allIds.addAll(rs.warehouseReadyBundleIds);
        return rs;
    }

    private Map<String, String> resolveQrCodes(ReadinessSets readiness) {
        Map<String, String> bundleIdToQrCode = new HashMap<>();
        if (readiness.allIds.isEmpty()) return bundleIdToQrCode;
        List<CuttingBundle> bundles = cuttingBundleService.listByIds(new ArrayList<>(readiness.allIds));
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b == null || !StringUtils.hasText(b.getId()) || !StringUtils.hasText(b.getQrCode())) continue;
                bundleIdToQrCode.put(b.getId().trim(), b.getQrCode().trim());
            }
        }
        return bundleIdToQrCode;
    }

    private Map<String, List<String>> buildQrStageHints(List<ScanRecord> scans, BundleScanAggregation agg,
            Map<String, String> bundleIdToQrCode) {
        Map<String, List<ScanRecord>> scansByBundle = new HashMap<>();
        for (ScanRecord scan : scans) {
            if (scan == null) continue;
            String scanResult = scan.getScanResult() == null ? "" : scan.getScanResult().trim().toLowerCase();
            if (!"success".equals(scanResult)) continue;
            String bid = scan.getCuttingBundleId() == null ? "" : scan.getCuttingBundleId().trim();
            if (!StringUtils.hasText(bid)) continue;
            scansByBundle.computeIfAbsent(bid, k -> new ArrayList<>()).add(scan);
        }
        Map<String, List<String>> bundleStageHints = new HashMap<>();
        if (!scansByBundle.isEmpty()) {
            List<String> allBundleIds = new ArrayList<>(scansByBundle.keySet());
            List<ProductWarehousing> allWhRecords = productWarehousingService.list(
                    new QueryWrapper<ProductWarehousing>().in("cutting_bundle_id", allBundleIds).eq("delete_flag", 0));
            Map<String, List<ProductWarehousing>> whByBundle = new HashMap<>();
            if (allWhRecords != null) {
                for (ProductWarehousing w : allWhRecords) {
                    if (w == null) continue;
                    String bid = w.getCuttingBundleId() == null ? "" : w.getCuttingBundleId().trim();
                    if (StringUtils.hasText(bid)) whByBundle.computeIfAbsent(bid, k -> new ArrayList<>()).add(w);
                }
            }
            for (Map.Entry<String, List<ScanRecord>> entry : scansByBundle.entrySet()) {
                String bid = entry.getKey();
                List<ProductWarehousing> whList = whByBundle.getOrDefault(bid, java.util.Collections.emptyList());
                try {
                    List<String> hints = warehousingHelper.buildBundleStageHints(entry.getValue(), whList);
                    if (hints != null && !hints.isEmpty()) bundleStageHints.put(bid, hints);
                } catch (Exception e) {
                    log.warn("buildBundleStageHints failed for bundleId={}: {}", bid, e.getMessage());
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
        return qrStageHints;
    }

    private Map<String, Object> buildOrderInfo(ProductionOrder order) {
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
        orderInfo.put("urgencyLevel", order.getUrgencyLevel());
        orderInfo.put("procurementConfirmRemark", order.getProcurementConfirmRemark());
        return orderInfo;
    }

    private Map<String, Object> buildStyleInfo(String styleId) {
        return buildStyleInfo(fetchStyleInfoEntity(styleId));
    }

    /**
     * 查询 StyleInfo 实体（供 buildStyleInfo 和 buildQualityTips 共用，避免重复查询）
     */
    private StyleInfo fetchStyleInfoEntity(String styleId) {
        if (!StringUtils.hasText(styleId)) {
            return null;
        }
        try {
            return styleInfoService.getById(styleId.trim());
        } catch (Exception e) {
            log.warn("查询款式信息失败: styleId={}", styleId, e);
            return null;
        }
    }

    private Map<String, Object> buildStyleInfo(StyleInfo styleInfo) {
        if (styleInfo == null) {
            return null;
        }
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
        // 质检注意事项相关字段（与 QualityAiSuggestionOrchestrator 使用的字段对齐）
        styleData.put("fabricComposition", styleInfo.getFabricComposition());
        styleData.put("washInstructions", styleInfo.getWashInstructions());
        styleData.put("difficultyLabel", styleInfo.getDifficultyLabel());
        styleData.put("difficultyLevel", styleInfo.getDifficultyLevel());
        styleData.put("safetyCategory", styleInfo.getSafetyCategory());
        styleData.put("executeStandard", styleInfo.getExecuteStandard());
        styleData.put("qualityGrade", styleInfo.getQualityGrade());
        styleData.put("imageInsight", styleInfo.getImageInsight());
        return styleData;
    }

    private List<StyleBom> buildBomList(String styleId) {
        if (!StringUtils.hasText(styleId)) {
            return Collections.emptyList();
        }
        try {
            List<StyleBom> bomList = styleBomService.list(
                    new LambdaQueryWrapper<StyleBom>().eq(StyleBom::getStyleId, styleId.trim())
            );
            return bomList != null ? bomList : Collections.emptyList();
        } catch (Exception e) {
            log.warn("查询BOM失败: styleId={}", styleId, e);
            return Collections.emptyList();
        }
    }

    /**
     * 构建质检注意事项（业务聚合版，替代硬编码通用提示）
     * 数据来源：订单 + 款式 + BOM + 历史次品记录
     * 与 PC 端 AiQualityHelperCard 互补：AI 建议接口提供 checkpoints/defectSuggestions，
     * 本方法提供基于真实业务字段的注意事项
     */
    private List<String> buildQualityTips(String orderId, ProductionOrder order,
                                          StyleInfo styleInfo, List<StyleBom> bomList) {
        List<String> tips = new ArrayList<>();

        // 1. 急单提示（与 QualityAiSuggestionOrchestrator.resolveUrgentTip 对齐）
        if ("urgent".equalsIgnoreCase(order.getUrgencyLevel())) {
            tips.add("⚠ 急单：赶工不降质检，请优先安排并加强首件检验");
        }

        // 2. 订单业务备注（客户要求/业务约定）
        if (StringUtils.hasText(order.getRemarks())) {
            String remarks = order.getRemarks().trim();
            // 截断过长备注
            if (remarks.length() > 200) {
                remarks = remarks.substring(0, 200) + "...";
            }
            tips.add("📋 订单备注：" + remarks);
        }

        // 3. 采购确认备注（物料未到齐说明）
        if (StringUtils.hasText(order.getProcurementConfirmRemark())) {
            String pcRemark = order.getProcurementConfirmRemark().trim();
            if (pcRemark.length() > 200) {
                pcRemark = pcRemark.substring(0, 200) + "...";
            }
            tips.add("📦 采购备注：" + pcRemark);
        }

        // 4. 工艺难度提示（AI 难度评级）
        if (styleInfo != null) {
            String difficultyLabel = styleInfo.getDifficultyLabel();
            String difficultyLevel = styleInfo.getDifficultyLevel();
            if (StringUtils.hasText(difficultyLabel)) {
                if ("HIGH_END".equalsIgnoreCase(difficultyLevel)
                        || "高定级".equals(difficultyLabel)
                        || "COMPLEX".equalsIgnoreCase(difficultyLevel)
                        || "工艺复杂".equals(difficultyLabel)) {
                    tips.add("🎯 工艺难度：" + difficultyLabel + "，建议全检并安排熟练工人");
                } else if (StringUtils.hasText(difficultyLabel)) {
                    tips.add("工艺难度：" + difficultyLabel);
                }
            }

            // 5. 面料成分 + 洗涤说明（决定面料层质检重点）
            String fabricComposition = styleInfo.getFabricComposition();
            if (StringUtils.hasText(fabricComposition)) {
                tips.add("🧵 面料成分：" + fabricComposition.trim());
            }
            String washInstructions = styleInfo.getWashInstructions();
            if (StringUtils.hasText(washInstructions)) {
                tips.add("洗涤说明：" + washInstructions.trim());
            }

            // 6. 安全类别（童装/婴幼儿 → 强制安全合规检查）
            String safetyCategory = styleInfo.getSafetyCategory();
            if (StringUtils.hasText(safetyCategory)) {
                String sc = safetyCategory.trim();
                if (sc.contains("童") || sc.contains("婴") || sc.contains("儿童") || sc.contains("幼儿")) {
                    tips.add("⚠ 安全类别：" + sc + "，必须检查绳带/小部件/甲醛等安全合规项");
                } else {
                    tips.add("安全类别：" + sc);
                }
            }

            // 7. 样衣审核反馈（前序质量风险点）
            String reviewStatus = styleInfo.getSampleReviewStatus();
            String reviewComment = styleInfo.getSampleReviewComment();
            if ("REWORK".equalsIgnoreCase(reviewStatus)) {
                StringBuilder tip = new StringBuilder("🔍 样衣审核反馈：需返修");
                if (StringUtils.hasText(reviewComment)) {
                    String rc = reviewComment.trim();
                    if (rc.length() > 150) {
                        rc = rc.substring(0, 150) + "...";
                    }
                    tip.append("（").append(rc).append("）");
                }
                tip.append("，请重点关注上次返修点");
                tips.add(tip.toString());
            } else if ("REJECT".equalsIgnoreCase(reviewStatus)) {
                tips.add("⚠ 样衣审核反馈：不合格，请核查样衣问题是否已解决");
            }

            // 8. AI 视觉识别摘要（豆包 Vision 识别工艺特征）
            String imageInsight = styleInfo.getImageInsight();
            if (StringUtils.hasText(imageInsight)) {
                String ii = imageInsight.trim();
                if (ii.length() > 200) {
                    ii = ii.substring(0, 200) + "...";
                }
                tips.add("🤖 工艺识别：" + ii);
            }
        }

        // 9. BOM 物料特殊备注（替换料/特殊要求）
        if (bomList != null && !bomList.isEmpty()) {
            for (StyleBom bom : bomList) {
                if (bom == null) continue;
                String bomRemark = bom.getRemark();
                if (StringUtils.hasText(bomRemark)) {
                    String r = bomRemark.trim();
                    if (r.length() > 150) {
                        r = r.substring(0, 150) + "...";
                    }
                    String materialName = StringUtils.hasText(bom.getMaterialName())
                            ? bom.getMaterialName().trim() : (StringUtils.hasText(bom.getMaterialCode())
                            ? bom.getMaterialCode().trim() : "物料");
                    tips.add("📌 物料「" + materialName + "」备注：" + r);
                }
            }
        }

        // 10. 历史次品统计（保留原有逻辑）
        appendDefectHistoryTips(tips, orderId);

        // 兜底：如果业务字段全为空，至少给一条提示（避免空数组）
        if (tips.isEmpty()) {
            tips.add("暂无特殊注意事项，请按通用质检标准执行");
        }

        return tips;
    }

    private void appendDefectHistoryTips(List<String> tips, String orderId) {
        try {
            List<ProductWarehousing> historyDefects = productWarehousingService.list(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, orderId.trim())
                            .eq(ProductWarehousing::getQualityStatus, "unqualified")
                            .and(w -> w.eq(ProductWarehousing::getDeleteFlag, 0).or().isNull(ProductWarehousing::getDeleteFlag))
            );
            if (historyDefects == null || historyDefects.isEmpty()) {
                return;
            }
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
                    java.util.Map<String, String> categoryLabels = new java.util.HashMap<>();
                    categoryLabels.put("appearance_integrity", "外观完整性");
                    categoryLabels.put("size_accuracy", "尺寸精度");
                    categoryLabels.put("process_compliance", "工艺规范性");
                    categoryLabels.put("functional_effectiveness", "功能有效性");
                    categoryLabels.put("other", "其他");
                    String topCategoryLabel = categoryLabels.getOrDefault(topCategory, topCategory);
                    tips.add(1, "⚠ 高频次品类别: " + topCategoryLabel + " (" + categoryCounts.get(topCategory) + "次)");
                }
            }
        } catch (Exception e) {
            log.warn("查询历史次品记录失败: orderId={}", orderId, e);
        }
    }
}
