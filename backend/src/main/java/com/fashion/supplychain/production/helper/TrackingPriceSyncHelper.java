package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 工序跟踪价格同步与查询辅助类
 *
 * 职责：单价同步、批量刷新、跟踪记录查询（含价格覆盖）、入库修复
 * 从 ProductionProcessTrackingOrchestrator 拆分而来
 */
@Slf4j
@Component
public class TrackingPriceSyncHelper {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private ProductionProcessTrackingService trackingService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private TrackingRecordInitHelper initHelper;

    /**
     * 查询订单工序跟踪记录（含模板最新单价覆盖 + 权限控制 + 质检状态填充）
     */
    public List<ProductionProcessTracking> getTrackingRecords(String productionOrderId) {
        ProductionOrder order = productionOrderService.getByIdIgnoreTenant(productionOrderId);
        if (order == null) {
            return List.of();
        }

        Long orderTenantId = order.getTenantId();
        Long userTenantId = UserContext.tenantId();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        if (!isSuperAdmin && orderTenantId != null && userTenantId != null
                && !orderTenantId.equals(userTenantId)) {
            TenantAssert.assertBelongsToCurrentTenant(orderTenantId, "生产订单");
        }

        List<ProductionProcessTracking> records;
        if (orderTenantId != null && !orderTenantId.equals(userTenantId)) {
            records = trackingService.listByOrderIdAndTenant(productionOrderId, orderTenantId);
        } else {
            records = trackingService.getByOrderId(productionOrderId);
        }
        if (CollectionUtils.isEmpty(records)) {
            return records;
        }

        if (!StringUtils.hasText(order.getStyleNo())) {
            return records;
        }

        String currentFactoryId = UserContext.factoryId();
        boolean isFactoryWorker = StringUtils.hasText(currentFactoryId) && UserContext.isWorker();
        boolean isExternalOrder = "EXTERNAL".equals(order.getFactoryType());

        if (isFactoryWorker && isExternalOrder) {
            for (ProductionProcessTracking tracking : records) {
                tracking.setUnitPrice(null);
                tracking.setSettlementAmount(null);
            }
            return records;
        }

        enrichWithTemplatePrices(records, order);
        fillNextStageScanned(records, productionOrderId);
        fillProgressStage(records, order);
        return records;
    }

    /**
     * 同步工序单价到跟踪记录（工序配置变更时调用）
     */
    public int syncUnitPrices(String productionOrderId) {
        log.info("开始同步工序单价，订单ID: {}", productionOrderId);

        ProductionOrder order = productionOrderService.getById(productionOrderId);
        if (order == null) {
            log.warn("同步单价失败：订单不存在 {}", productionOrderId);
            return 0;
        }

        if ("EXTERNAL".equals(order.getFactoryType())) {
            log.info("外发订单 {} 跳过模板单价同步，保持下单时锁定价格", order.getOrderNo());
            return 0;
        }

        Map<String, BigDecimal> priceMap = resolvePriceMap(order);
        Map<String, String> codeMap = resolveCodeMap(order);
        if (priceMap.isEmpty()) {
            log.warn("订单 {} 无可用的工序价格数据", order.getOrderNo());
            return 0;
        }

        List<ProductionProcessTracking> trackingRecords = trackingService.getByOrderId(productionOrderId);
        if (CollectionUtils.isEmpty(trackingRecords)) {
            log.info("订单 {} 没有跟踪记录，跳过单价同步", order.getOrderNo());
            return 0;
        }

        int updatedCount = syncTrackingPrices(trackingRecords, priceMap, codeMap, productionOrderId, order.getOrderNo());
        int scanUpdated = syncScanRecordPrices(priceMap, codeMap, productionOrderId);

        log.info("订单 {} 单价同步完成：跟踪记录更新 {} 条，扫码记录更新 {} 条",
                order.getOrderNo(), updatedCount, scanUpdated);
        return updatedCount + scanUpdated;
    }

    /**
     * 批量同步所有订单的工序跟踪单价（管理员维护用）
     */
    public Map<String, Object> syncAllOrderTrackingPrices() {
        log.warn("开始批量同步所有订单工序跟踪单价（管理员维护操作）");

        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ne(ProductionOrder::getStatus, "completed")
                .isNotNull(ProductionOrder::getStyleNo)
                .last("LIMIT 5000")
                .list();

        int totalOrders = 0, updatedOrders = 0, totalRecordsUpdated = 0, errorCount = 0;

        for (ProductionOrder order : orders) {
            if (!StringUtils.hasText(order.getStyleNo())) continue;
            totalOrders++;
            try {
                int count = syncUnitPrices(order.getId());
                if (count > 0) {
                    updatedOrders++;
                    totalRecordsUpdated += count;
                }
            } catch (Exception e) {
                errorCount++;
                log.warn("同步订单 {} 跟踪单价失败: {}", order.getOrderNo(), e.getMessage());
            }
        }

        Map<String, Object> summary = new HashMap<>();
        summary.put("totalOrders", totalOrders);
        summary.put("updatedOrders", updatedOrders);
        summary.put("totalRecordsUpdated", totalRecordsUpdated);
        summary.put("errorCount", errorCount);

        log.warn("批量同步完成 - 总订单: {}, 更新: {}, 记录数: {}, 失败: {}",
                totalOrders, updatedOrders, totalRecordsUpdated, errorCount);
        return summary;
    }

    /**
     * 批量刷新所有订单的 progressWorkflowJson 中的工序单价
     */
    public Map<String, Object> refreshWorkflowPrices() {
        log.warn("开始批量刷新订单工序单价（管理员维护操作）");

        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ne(ProductionOrder::getStatus, "completed")
                .isNotNull(ProductionOrder::getProgressWorkflowJson)
                .ne(ProductionOrder::getProgressWorkflowJson, "")
                .isNotNull(ProductionOrder::getStyleNo)
                .last("LIMIT 5000")
                .list();

        if (orders.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("message", "没有需要刷新的订单");
            return empty;
        }

        int total = orders.size(), updatedCount = 0, skipCount = 0, errorCount = 0;
        List<Map<String, Object>> details = new ArrayList<>();
        Map<String, List<Map<String, Object>>> templateCache = new HashMap<>();

        for (ProductionOrder order : orders) {
            try {
                if ("EXTERNAL".equals(order.getFactoryType()) || !StringUtils.hasText(order.getStyleNo())) {
                    skipCount++;
                    continue;
                }

                String styleNo = order.getStyleNo().trim();
                List<Map<String, Object>> templateNodes = templateCache.computeIfAbsent(styleNo, k -> {
                    List<Map<String, Object>> nodes = templateLibraryService.resolveProgressNodeUnitPrices(k);
                    return nodes != null ? nodes : new ArrayList<>();
                });
                if (templateNodes.isEmpty()) {
                    skipCount++;
                    continue;
                }

                Map<String, BigDecimal> priceMap = buildPriceMapFromTemplate(templateNodes);
                Map<String, String> codeMap = buildCodeMapFromTemplate(templateNodes);
                if (priceMap.isEmpty()) {
                    skipCount++;
                    continue;
                }

                boolean changed = updateWorkflowJsonPrices(order, priceMap, codeMap);
                if (changed) {
                    updatedCount++;
                    Map<String, Object> detail = new HashMap<>();
                    detail.put("orderNo", order.getOrderNo());
                    detail.put("styleNo", styleNo);
                    detail.put("status", "updated");
                    details.add(detail);
                } else {
                    skipCount++;
                }
            } catch (Exception e) {
                errorCount++;
                log.warn("刷新订单 {} 工序单价失败: {}", order.getOrderNo(), e.getMessage());
            }
        }

        Map<String, Object> summary = new HashMap<>();
        summary.put("totalOrders", total);
        summary.put("updatedCount", updatedCount);
        summary.put("skipCount", skipCount);
        summary.put("errorCount", errorCount);
        summary.put("details", details);

        log.warn("批量刷新完成 - 总: {}, 更新: {}, 跳过: {}, 失败: {}",
                total, updatedCount, skipCount, errorCount);
        return summary;
    }

    /**
     * 补齐历史漏更新的入库工序跟踪记录
     */
    public Map<String, Object> repairWarehousingTracking(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        String oid = orderId.trim();

        List<ProductWarehousing> warehousingList = productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getOrderId, oid)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .eq(ProductWarehousing::getQualityStatus, "qualified")
                .last("LIMIT 5000")
                .list();

        int repaired = 0, skipped = 0;
        List<Map<String, Object>> details = new ArrayList<>();

        for (ProductWarehousing w : warehousingList) {
            String bundleId = StringUtils.hasText(w.getCuttingBundleId()) ? w.getCuttingBundleId().trim() : null;
            if (!StringUtils.hasText(bundleId)) {
                skipped++;
                continue;
            }

            ProductionProcessTracking tracking = trackingService.getByBundleAndProcessName(bundleId, "入库");
            if (tracking == null) {
                tracking = trackingService.getByBundleAndProcess(bundleId, "warehouse_manual");
            }
            if (tracking == null || !"pending".equals(tracking.getScanStatus())) {
                skipped++;
                continue;
            }

            tracking.setScanStatus("scanned");
            tracking.setScanTime(w.getCreateTime() != null ? w.getCreateTime() : LocalDateTime.now());
            if (StringUtils.hasText(w.getWarehousingOperatorId())) {
                tracking.setOperatorId(w.getWarehousingOperatorId());
                tracking.setOperatorName(w.getWarehousingOperatorName());
            } else if (StringUtils.hasText(w.getReceiverId())) {
                tracking.setOperatorId(w.getReceiverId());
                tracking.setOperatorName(w.getReceiverName());
            }
            if (tracking.getUnitPrice() != null && tracking.getQuantity() != null
                    && tracking.getUnitPrice().compareTo(BigDecimal.ZERO) > 0 && tracking.getQuantity() > 0) {
                tracking.setSettlementAmount(tracking.getUnitPrice().multiply(new BigDecimal(tracking.getQuantity())));
            }

            trackingService.updateById(tracking);
            repaired++;

            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("bundleId", bundleId);
            detail.put("trackingId", tracking.getId());
            detail.put("operatorName", tracking.getOperatorName());
            details.add(detail);
            log.info("[RepairTracking] 修复入库跟踪: bundleId={}, trackingId={}, operator={}",
                    bundleId, tracking.getId(), tracking.getOperatorName());
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("repaired", repaired);
        summary.put("skipped", skipped);
        summary.put("total", warehousingList.size());
        summary.put("details", details);
        log.info("[RepairTracking] 订单 {} 修复完成 repaired={} skipped={} total={}",
                oid, repaired, skipped, warehousingList.size());
        return summary;
    }

    // ========== 私有方法 ==========

    private void enrichWithTemplatePrices(List<ProductionProcessTracking> records, ProductionOrder order) {
        try {
            List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
            if (templateNodes == null || templateNodes.isEmpty()) return;

            Map<String, BigDecimal> priceMap = new HashMap<>();
            Map<String, String> codeMap = new HashMap<>();
            Map<String, String> stageMap = new HashMap<>();
            List<String> templateCurrentNames = new ArrayList<>();
            for (Map<String, Object> tn : templateNodes) {
                String name = initHelper.getStringValue(tn, "name", "").trim();
                BigDecimal price = initHelper.getBigDecimalValue(tn, "unitPrice", BigDecimal.ZERO);
                if (!name.isEmpty()) {
                    priceMap.put(name, price);
                    templateCurrentNames.add(name);
                }
                String id = initHelper.getStringValue(tn, "id", "").trim();
                if (!name.isEmpty() && !id.isEmpty()) {
                    codeMap.put(name, id);
                }
                String stage = initHelper.getStringValue(tn, "progressStage", "").trim();
                if (!name.isEmpty() && !stage.isEmpty()) {
                    stageMap.put(name, stage);
                }
            }
            if (priceMap.isEmpty()) return;

            for (ProductionProcessTracking tracking : records) {
                String oldName = tracking.getProcessName() == null ? "" : tracking.getProcessName().trim();
                if (oldName.isEmpty() || priceMap.containsKey(oldName)) continue;

                String currentName = null;
                for (String tplName : templateCurrentNames) {
                    if (templateLibraryService.progressStageNameMatches(tplName, oldName)) {
                        currentName = tplName;
                        break;
                    }
                }
                if (currentName != null) {
                    tracking.setProcessName(currentName);
                    if (oldName.equals(tracking.getProcessCode())) {
                        tracking.setProcessCode(currentName);
                    }
                }
            }

            for (ProductionProcessTracking tracking : records) {
                String pName = tracking.getProcessName() != null ? tracking.getProcessName().trim() : "";
                BigDecimal templatePrice = priceMap.get(pName);
                if (templatePrice == null) templatePrice = priceMap.get(tracking.getProcessCode());
                if (templatePrice != null) {
                    tracking.setUnitPrice(templatePrice);
                    if (tracking.getQuantity() != null) {
                        tracking.setSettlementAmount(templatePrice.multiply(new BigDecimal(tracking.getQuantity())));
                    }
                }
                String templateCode = codeMap.get(pName);
                if (StringUtils.hasText(templateCode)) {
                    String currentCode = tracking.getProcessCode() != null ? tracking.getProcessCode().trim() : "";
                    if (!templateCode.equals(currentCode)) {
                        if (!StringUtils.hasText(currentCode) || currentCode.equals(pName)) {
                            tracking.setProcessCode(templateCode);
                        }
                    }
                }
                String templateStage = stageMap.get(pName);
                if (StringUtils.hasText(templateStage)) {
                    tracking.setProgressStage(templateStage);
                }
            }
        } catch (Exception e) {
            log.warn("获取模板价格失败，使用DB中存储的价格 orderNo={}: {}", order.getOrderNo(), e.getMessage());
        }
    }

    private void fillNextStageScanned(List<ProductionProcessTracking> records, String productionOrderId) {
        try {
            boolean anyScanned = records.stream()
                    .anyMatch(r -> "scanned".equals(r.getScanStatus()) && r.getCuttingBundleId() != null);
            if (!anyScanned) return;

            Set<String> bundlesWithQualityScan = new HashSet<>();
            List<ScanRecord> qualityScans = scanRecordService.list(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getOrderId, productionOrderId)
                            .eq(ScanRecord::getScanType, "quality")
                            .eq(ScanRecord::getScanResult, "success")
                            .isNotNull(ScanRecord::getCuttingBundleId));
            for (ScanRecord qs : qualityScans) {
                if (qs.getCuttingBundleId() != null) bundlesWithQualityScan.add(qs.getCuttingBundleId());
            }
            for (ProductionProcessTracking r : records) {
                if ("scanned".equals(r.getScanStatus()) && r.getCuttingBundleId() != null) {
                    r.setHasNextStageScanned(bundlesWithQualityScan.contains(r.getCuttingBundleId()));
                }
            }
        } catch (Exception e) {
            log.warn("填充hasNextStageScanned失败，忽略 orderId={}: {}", productionOrderId, e.getMessage());
        }
    }

    private void fillProgressStage(List<ProductionProcessTracking> records, ProductionOrder order) {
        try {
            Map<String, String> nameToStage = new HashMap<>();
            Map<String, Map<String, Object>> codeToNode = new HashMap<>();
            String workflowJson = order.getProgressWorkflowJson();
            if (StringUtils.hasText(workflowJson)) {
                Map<String, Object> workflow = OBJECT_MAPPER.readValue(workflowJson, new TypeReference<Map<String, Object>>() {});
                Object nodesObj = workflow.get("nodes");
                if (nodesObj instanceof List<?> nodeList) {
                    for (Object item : nodeList) {
                        if (item instanceof Map) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> node = (Map<String, Object>) item;
                            String name = String.valueOf(node.getOrDefault("name", "")).trim();
                            String stage = String.valueOf(node.getOrDefault("progressStage", "")).trim();
                            String code = String.valueOf(node.getOrDefault("processCode", node.getOrDefault("id", ""))).trim();
                            if (!name.isEmpty() && !stage.isEmpty()) {
                                nameToStage.put(name, stage);
                            }
                            if (!code.isEmpty()) {
                                codeToNode.put(code, node);
                            }
                        }
                    }
                }
            }
            if (nameToStage.isEmpty() && StringUtils.hasText(order.getStyleNo())) {
                List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
                if (templateNodes != null) {
                    for (Map<String, Object> tn : templateNodes) {
                        String name = String.valueOf(tn.getOrDefault("name", "")).trim();
                        String stage = String.valueOf(tn.getOrDefault("progressStage", "")).trim();
                        if (!name.isEmpty() && !stage.isEmpty()) {
                            nameToStage.put(name, stage);
                        }
                    }
                }
            }
            if (nameToStage.isEmpty() && codeToNode.isEmpty()) return;
            for (ProductionProcessTracking r : records) {
                String pName = r.getProcessName() != null ? r.getProcessName().trim() : "";
                String pCode = r.getProcessCode() != null ? r.getProcessCode().trim() : "";

                Map<String, Object> matchedNode = codeToNode.get(pCode);
                if (matchedNode != null) {
                    String wfName = String.valueOf(matchedNode.getOrDefault("name", "")).trim();
                    String wfStage = String.valueOf(matchedNode.getOrDefault("progressStage", "")).trim();
                    Object wfPrice = matchedNode.get("unitPrice");
                    if (!wfName.isEmpty()) r.setProcessName(wfName);
                    if (!wfStage.isEmpty()) r.setProgressStage(wfStage);
                    if (wfPrice != null) {
                        try {
                            BigDecimal price = new BigDecimal(String.valueOf(wfPrice));
                            r.setUnitPrice(price);
                            if (r.getQuantity() != null && price != null) {
                                r.setSettlementAmount(price.multiply(BigDecimal.valueOf(r.getQuantity())));
                            }
                        } catch (NumberFormatException ignored) {}
                    }
                    continue;
                }

                String stage = nameToStage.get(pName);
                if (stage == null && !pCode.isEmpty()) stage = nameToStage.get(pCode);
                if (stage != null) r.setProgressStage(stage);
            }
        } catch (Exception e) {
            log.warn("填充progressStage失败，忽略 orderNo={}: {}", order.getOrderNo(), e.getMessage());
        }
    }

    private Map<String, BigDecimal> resolvePriceMap(ProductionOrder order) {
        Map<String, BigDecimal> priceMap = new HashMap<>();
        String styleNo = order.getStyleNo();
        if (StringUtils.hasText(styleNo)) {
            try {
                List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo.trim());
                if (templateNodes != null) {
                    for (Map<String, Object> tn : templateNodes) {
                        String name = initHelper.getStringValue(tn, "name", "").trim();
                        BigDecimal price = initHelper.getBigDecimalValue(tn, "unitPrice", BigDecimal.ZERO);
                        if (!name.isEmpty()) priceMap.put(name, price);
                    }
                }
            } catch (Exception e) {
                log.warn("从模板库获取价格失败 styleNo={}: {}", styleNo, e.getMessage());
            }
        }
        if (priceMap.isEmpty()) {
            List<Map<String, Object>> processNodes = initHelper.parseProcessNodes(order);
            if (!CollectionUtils.isEmpty(processNodes)) {
                for (Map<String, Object> node : processNodes) {
                    String name = initHelper.getStringValue(node, "name", "").trim();
                    BigDecimal unitPrice = initHelper.getBigDecimalValue(node, "unitPrice", BigDecimal.ZERO);
                    if (!name.isEmpty()) priceMap.put(name, unitPrice);
                }
            }
        }
        return priceMap;
    }

    private Map<String, String> resolveCodeMap(ProductionOrder order) {
        Map<String, String> codeMap = new HashMap<>();
        String styleNo = order.getStyleNo();
        if (StringUtils.hasText(styleNo)) {
            try {
                List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo.trim());
                if (templateNodes != null) {
                    for (Map<String, Object> tn : templateNodes) {
                        String name = initHelper.getStringValue(tn, "name", "").trim();
                        String id = initHelper.getStringValue(tn, "id", "").trim();
                        if (!name.isEmpty() && !id.isEmpty()) {
                            codeMap.put(name, id);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("从模板库获取工序编号失败 styleNo={}: {}", styleNo, e.getMessage());
            }
        }
        if (codeMap.isEmpty()) {
            List<Map<String, Object>> processNodes = initHelper.parseProcessNodes(order);
            if (!CollectionUtils.isEmpty(processNodes)) {
                for (Map<String, Object> node : processNodes) {
                    String name = initHelper.getStringValue(node, "name", "").trim();
                    String id = initHelper.getStringValue(node, "id", "").trim();
                    if (!name.isEmpty() && !id.isEmpty() && !id.equals(name)) {
                        codeMap.put(name, id);
                    }
                }
            }
        }
        return codeMap;
    }

    private int syncTrackingPrices(List<ProductionProcessTracking> trackingRecords,
                                   Map<String, BigDecimal> priceMap, Map<String, String> codeMap,
                                   String productionOrderId, String orderNo) {
        int updatedCount = 0;
        for (ProductionProcessTracking tracking : trackingRecords) {
            BigDecimal newPrice = priceMap.get(tracking.getProcessName());
            if (newPrice == null) newPrice = priceMap.get(tracking.getProcessCode());
            if (newPrice == null) continue;

            BigDecimal oldPrice = tracking.getUnitPrice();
            boolean priceChanged = oldPrice == null || oldPrice.compareTo(newPrice) != 0;

            if (priceChanged) {
                tracking.setUnitPrice(newPrice);
                if ("scanned".equals(tracking.getScanStatus()) && tracking.getQuantity() != null) {
                    if (Boolean.TRUE.equals(tracking.getIsSettled())) {
                        log.warn("跳过已结算记录的结算金额更新: trackingId={}, orderId={}, processCode={}, settledBatchNo={}",
                                tracking.getId(), productionOrderId, tracking.getProcessCode(), tracking.getSettledBatchNo());
                    } else {
                        tracking.setSettlementAmount(newPrice.multiply(new BigDecimal(tracking.getQuantity())));
                    }
                }
            }

            String newCode = codeMap.get(tracking.getProcessName());
            boolean codeChanged = false;
            if (StringUtils.hasText(newCode) && !newCode.equals(tracking.getProcessCode())) {
                if (!StringUtils.hasText(tracking.getProcessCode()) || tracking.getProcessCode().equals(tracking.getProcessName())) {
                    tracking.setProcessCode(newCode);
                    codeChanged = true;
                } else {
                    log.debug("[TrackingPriceSync] 保留已有模板编号: trackingId={}, processCode={}, newCode={}",
                            tracking.getId(), tracking.getProcessCode(), newCode);
                }
            }

            if (priceChanged || codeChanged) {
                tracking.setUpdater(UserContext.username() != null ? UserContext.username() : "system");
                trackingService.updateById(tracking);
                updatedCount++;
            }
        }
        log.info("订单 {} 跟踪记录同步完成：共 {} 条，更新 {} 条",
                orderNo, trackingRecords.size(), updatedCount);
        return updatedCount;
    }

    private int syncScanRecordPrices(Map<String, BigDecimal> priceMap, Map<String, String> codeMap, String productionOrderId) {
        int scanUpdated = 0;
        for (Map.Entry<String, BigDecimal> entry : priceMap.entrySet()) {
            String pName = entry.getKey();
            BigDecimal newPrice = entry.getValue();
            if (newPrice == null || newPrice.compareTo(BigDecimal.ZERO) <= 0) continue;

            List<ScanRecord> scanRecords = scanRecordService.lambdaQuery()
                    .eq(ScanRecord::getOrderId, productionOrderId)
                    .ne(ScanRecord::getScanType, "orchestration")
                    .eq(ScanRecord::getScanResult, "success")
                    .and(w -> w.eq(ScanRecord::getProcessName, pName))
                    .and(w -> w.isNull(ScanRecord::getPayrollSettlementId)
                            .or().eq(ScanRecord::getPayrollSettlementId, ""))
                    .and(w -> w.isNull(ScanRecord::getSettlementStatus)
                            .or().ne(ScanRecord::getSettlementStatus, "payroll_settled"))
                    .list();

            String newCode = codeMap.get(pName);
            for (ScanRecord sr : scanRecords) {
                if (sr.getQuantity() == null || sr.getQuantity() <= 0) continue;
                boolean priceChanged = newPrice.compareTo(sr.getProcessUnitPrice() != null ? sr.getProcessUnitPrice()
                        : (sr.getUnitPrice() != null ? sr.getUnitPrice() : BigDecimal.ZERO)) != 0;
                boolean codeChanged = StringUtils.hasText(newCode) && !newCode.equals(sr.getProcessCode());

                if (!priceChanged && !codeChanged) continue;

                ScanRecord patch = new ScanRecord();
                patch.setId(sr.getId());
                if (priceChanged) {
                    BigDecimal cost = newPrice.multiply(new BigDecimal(sr.getQuantity()));
                    patch.setUnitPrice(newPrice);
                    patch.setProcessUnitPrice(newPrice);
                    patch.setScanCost(cost);
                    patch.setTotalAmount(cost);
                }
                if (codeChanged) {
                    patch.setProcessCode(newCode);
                }
                scanRecordService.updateById(patch);
                scanUpdated++;
            }
        }
        return scanUpdated;
    }

    private Map<String, BigDecimal> buildPriceMapFromTemplate(List<Map<String, Object>> templateNodes) {
        Map<String, BigDecimal> priceMap = new HashMap<>();
        for (Map<String, Object> tn : templateNodes) {
            String name = String.valueOf(tn.getOrDefault("name", "")).trim();
            Object up = tn.get("unitPrice");
            BigDecimal price = BigDecimal.ZERO;
            if (up instanceof BigDecimal) price = (BigDecimal) up;
            else if (up instanceof Number) price = BigDecimal.valueOf(((Number) up).doubleValue());
            if (StringUtils.hasText(name) && price.compareTo(BigDecimal.ZERO) > 0) {
                priceMap.put(name, price);
            }
        }
        return priceMap;
    }

    private Map<String, String> buildCodeMapFromTemplate(List<Map<String, Object>> templateNodes) {
        Map<String, String> codeMap = new HashMap<>();
        for (Map<String, Object> tn : templateNodes) {
            String name = String.valueOf(tn.getOrDefault("name", "")).trim();
            String id = String.valueOf(tn.getOrDefault("id", "")).trim();
            if (StringUtils.hasText(name) && StringUtils.hasText(id)) {
                codeMap.put(name, id);
            }
        }
        return codeMap;
    }

    @SuppressWarnings("unchecked")
    private boolean updateWorkflowJsonPrices(ProductionOrder order, Map<String, BigDecimal> priceMap,
                                              Map<String, String> codeMap) throws Exception {
        String json = order.getProgressWorkflowJson();
        Map<String, Object> workflow = OBJECT_MAPPER.readValue(json, new TypeReference<Map<String, Object>>() {});
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) workflow.get("nodes");
        if (nodes == null || nodes.isEmpty()) return false;

        boolean changed = false;
        for (Map<String, Object> node : nodes) {
            String nodeName = String.valueOf(node.getOrDefault("name", "")).trim();
            BigDecimal templatePrice = priceMap.get(nodeName);
            if (templatePrice != null) {
                Object current = node.get("unitPrice");
                BigDecimal currentPrice = BigDecimal.ZERO;
                if (current instanceof Number) currentPrice = BigDecimal.valueOf(((Number) current).doubleValue());
                if (templatePrice.compareTo(currentPrice) != 0) {
                    node.put("unitPrice", templatePrice);
                    changed = true;
                }
            }
            String templateCode = codeMap.get(nodeName);
            if (StringUtils.hasText(templateCode)) {
                Object currentId = node.get("id");
                String currentIdStr = currentId == null ? "" : String.valueOf(currentId).trim();
                if (!templateCode.equals(currentIdStr)) {
                    node.put("id", templateCode);
                    changed = true;
                }
            }
        }

        if (changed) {
            String updatedJson = OBJECT_MAPPER.writeValueAsString(workflow);
            productionOrderService.lambdaUpdate()
                    .eq(ProductionOrder::getId, order.getId())
                    .set(ProductionOrder::getProgressWorkflowJson, updatedJson)
                    .update();
        }
        return changed;
    }
}
