package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class TrackingPriceBatchHelper {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionProcessTrackingService trackingService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private TrackingPriceSyncHelper priceSyncHelper;

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
                int count = priceSyncHelper.syncUnitPrices(order.getId());
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
