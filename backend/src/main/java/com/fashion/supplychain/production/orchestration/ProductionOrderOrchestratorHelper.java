package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * ProductionOrderOrchestrator 的辅助类
 * 提取验证、JSON 解析、数据组装等非编排逻辑
 */
@Component
@Slf4j
public class ProductionOrderOrchestratorHelper {

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private com.fashion.supplychain.system.service.UserService userService;

    @Autowired
    private StyleAttachmentOrchestrator styleAttachmentOrchestrator;

    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;

    // ---------- 验证方法 ----------

    /**
     * 验证人员字段（跟单员、纸样师）是否为系统中的真实用户
     */
    public void validatePersonnelFields(ProductionOrder productionOrder) {
        if (productionOrder == null) {
            return;
        }

        List<String> invalidPersonnel = new ArrayList<>();

        String merchandiser = productionOrder.getMerchandiser();
        if (StringUtils.hasText(merchandiser)) {
            String trimmedName = merchandiser.trim();
            if (!userService.existsByName(trimmedName)) {
                invalidPersonnel.add(String.format("跟单员【%s】", trimmedName));
            }
        }

        String patternMaker = productionOrder.getPatternMaker();
        if (StringUtils.hasText(patternMaker)) {
            String trimmedName = patternMaker.trim();
            if (!userService.existsByName(trimmedName)) {
                invalidPersonnel.add(String.format("纸样师【%s】", trimmedName));
            }
        }

        if (!invalidPersonnel.isEmpty()) {
            String errorMessage = String.format(
                "以下人员在系统中不存在，请先创建用户账号再导入订单：%s",
                String.join("、", invalidPersonnel)
            );
            throw new IllegalStateException(errorMessage);
        }
    }

    public void validateUnitPriceSources(ProductionOrder productionOrder) {
        if (productionOrder == null) {
            throw new IllegalArgumentException("参数错误");
        }
        String details = safeText(productionOrder.getOrderDetails());
        if (!StringUtils.hasText(details)) {
            throw new IllegalStateException("订单明细缺少物料价格来源信息");
        }
        List<Map<String, Object>> lines = resolveOrderLines(details);
        if (lines == null || lines.isEmpty()) {
            throw new IllegalStateException("订单明细缺少物料价格来源信息");
        }
        for (Map<String, Object> r : lines) {
            if (r == null || r.isEmpty()) {
                continue;
            }
            String source = pickFirstText(r, "materialPriceSource", "material_price_source", "materialPrice来源", "物料价格来源");
            String acquiredAt = pickFirstText(r, "materialPriceAcquiredAt", "material_price_acquired_at", "materialPriceTime", "物料价格获取时间");
            String version = pickFirstText(r, "materialPriceVersion", "material_price_version", "materialPriceVer", "物料价格版本");
            if (!StringUtils.hasText(source) || !"物料采购系统".equals(source.trim())) {
                throw new IllegalStateException("物料价格来源必须为物料采购系统");
            }
            if (!StringUtils.hasText(acquiredAt)) {
                throw new IllegalStateException("物料价格获取时间不能为空");
            }
            if (!StringUtils.hasText(version)) {
                throw new IllegalStateException("物料价格版本不能为空");
            }
        }
    }

    /**
     * 检查纸样是否齐全（只记录警告，不阻止流程）
     */
    public void checkPatternCompleteWarning(String styleId) {
        if (!StringUtils.hasText(styleId)) {
            return;
        }
        try {
            boolean complete = styleAttachmentOrchestrator != null
                    && styleAttachmentOrchestrator.checkPatternComplete(styleId) != null
                    && Boolean.TRUE.equals(styleAttachmentOrchestrator.checkPatternComplete(styleId).get("complete"));
            if (!complete) {
                log.warn("Pattern files not complete for styleId={}, order creation continues with warning", styleId);
            }
        } catch (Exception e) {
            log.warn("Failed to check pattern complete for styleId={}: {}", styleId, e.getMessage());
        }
    }

    // ---------- JSON 解析方法 ----------

    public List<Map<String, Object>> resolveOrderLines(String details) {
        if (!StringUtils.hasText(details)) {
            return List.of();
        }
        try {
            List<Map<String, Object>> list = objectMapper.readValue(details,
                    new TypeReference<List<Map<String, Object>>>() {
                    });
            if (list != null) {
                return list;
            }
        } catch (Exception ignore) {
        }
        try {
            Map<String, Object> obj = objectMapper.readValue(details, new TypeReference<Map<String, Object>>() {
            });
            Object lines = obj == null ? null
                    : (obj.get("lines") != null ? obj.get("lines")
                            : (obj.get("items") != null ? obj.get("items")
                                    : (obj.get("details") != null ? obj.get("details") : obj.get("list"))));
            if (lines instanceof List) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> cast = (List<Map<String, Object>>) lines;
                return cast;
            }
        } catch (Exception ignore) {
        }
        return List.of();
    }

    public String normalizeProgressWorkflowJson(String raw) {
        String text = StringUtils.hasText(raw) ? raw.trim() : null;
        if (!StringUtils.hasText(text)) {
            return null;
        }

        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(text);
            com.fasterxml.jackson.databind.JsonNode arr = root == null ? null : root.get("nodes");
            if (arr == null || !arr.isArray()) {
                return null;
            }

            List<Map<String, Object>> outNodes = new ArrayList<>();
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            for (com.fasterxml.jackson.databind.JsonNode n : arr) {
                if (n == null) {
                    continue;
                }
                String name = n.hasNonNull("name") ? n.get("name").asText("") : "";
                name = StringUtils.hasText(name) ? name.trim() : "";
                if (!StringUtils.hasText(name)) {
                    continue;
                }
                String id = n.hasNonNull("id") ? n.get("id").asText("") : "";
                id = StringUtils.hasText(id) ? id.trim() : name;

                String idLower = id.trim().toLowerCase();
                if ("shipment".equals(idLower) || "出货".equals(name) || "发货".equals(name) || "发运".equals(name)) {
                    continue;
                }

                if (!seen.add(name)) {
                    continue;
                }

                BigDecimal unitPrice = BigDecimal.ZERO;
                if (n.hasNonNull("unitPrice")) {
                    com.fasterxml.jackson.databind.JsonNode v = n.get("unitPrice");
                    if (v != null) {
                        if (v.isNumber()) {
                            unitPrice = v.decimalValue();
                        } else {
                            try {
                                unitPrice = new BigDecimal(v.asText("0").trim());
                            } catch (Exception ignore) {
                                unitPrice = BigDecimal.ZERO;
                            }
                        }
                    }
                }
                if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) < 0) {
                    unitPrice = BigDecimal.ZERO;
                }

                outNodes.add(Map.of(
                        "id", id,
                        "name", name,
                        "unitPrice", unitPrice));
            }

            if (outNodes.isEmpty()) {
                return null;
            }

            return objectMapper.writeValueAsString(Map.of("nodes", outNodes));
        } catch (Exception e) {
            return null;
        }
    }

    // ---------- 工具方法 ----------

    public String buildSkuNo(String orderNo, String styleNo, String color, String size) {
        String on = StringUtils.hasText(orderNo) ? orderNo.trim() : "";
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        String c = StringUtils.hasText(color) ? color.trim() : "";
        String s = StringUtils.hasText(size) ? size.trim() : "";
        return String.format("%s:%s:%s:%s", on, sn, c, s);
    }

    public String pickFirstText(Map<String, Object> row, String... keys) {
        if (row == null || keys == null) {
            return "";
        }
        for (String k : keys) {
            if (!StringUtils.hasText(k)) {
                continue;
            }
            if (row.containsKey(k)) {
                return safeText(row.get(k));
            }
        }
        return "";
    }

    public String safeText(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    public boolean isProcurementCompleted(ProductionOrder order) {
        if (order == null) {
            return false;
        }
        Integer manual = order.getProcurementManuallyCompleted();
        boolean manualDone = manual != null && manual == 1;
        boolean endTimeDone = order.getProcurementEndTime() != null;
        Integer rate = order.getProcurementCompletionRate();
        boolean rateDone = rate != null && rate >= 100;
        return manualDone || endTimeDone || rateDone;
    }

    public String getProcessNodeName(String processNode) {
        switch (processNode) {
            case "cutting":
                return "裁剪";
            case "sewing":
                return "车缝";
            case "finishing":
                return "尾部";
            case "warehousing":
                return "入库";
            default:
                return processNode;
        }
    }

    // ---------- 数据组装方法 ----------

    /**
     * 获取订单的采购完成状态
     */
    public Map<String, Object> getProcurementStatus(String orderId) {
        Map<String, Object> status = new LinkedHashMap<>();

        ProductionOrder order = productionOrderQueryService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("订单不存在: " + orderId);
        }

        Integer materialArrivalRate = order.getMaterialArrivalRate();
        Integer manuallyCompleted = order.getProcurementManuallyCompleted();
        boolean isManuallyConfirmed = (manuallyCompleted != null && manuallyCompleted == 1);

        boolean procurementComplete = false;
        String operatorName = null;
        LocalDateTime completedTime = null;

        if (materialArrivalRate != null && materialArrivalRate >= 100) {
            procurementComplete = true;
            operatorName = order.getProcurementOperatorName();
            completedTime = order.getProcurementEndTime();
        } else if (materialArrivalRate != null && materialArrivalRate >= 50 && isManuallyConfirmed) {
            procurementComplete = true;
            operatorName = order.getProcurementConfirmedByName();
            completedTime = order.getProcurementConfirmedAt();
        }

        status.put("completed", procurementComplete);
        status.put("completionRate", materialArrivalRate != null ? materialArrivalRate : 0);
        status.put("operatorName", operatorName);
        status.put("completedTime", completedTime);
        status.put("manuallyConfirmed", isManuallyConfirmed);
        status.put("procurementStartTime", order.getProcurementStartTime());

        log.info("Retrieved procurement status for order: orderId={}, completed={}, rate={}%, operator={}",
                 orderId, procurementComplete, materialArrivalRate, operatorName);

        return status;
    }

    /**
     * 获取订单的所有工序节点状态
     */
    public Map<String, Map<String, Object>> getAllProcessStatus(String orderId) {
        Map<String, Map<String, Object>> allStatus = new LinkedHashMap<>();

        ProductionOrder order = productionOrderQueryService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("订单不存在: " + orderId);
        }

        Integer orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        Integer cuttingQty = order.getCuttingQuantity() != null ? order.getCuttingQuantity() : 0;
        Integer warehousingQty = order.getWarehousingQualifiedQuantity() != null ? order.getWarehousingQualifiedQuantity() : 0;

        // 1. 裁剪工序状态
        Map<String, Object> cuttingStatus = new LinkedHashMap<>();
        cuttingStatus.put("completed", order.getCuttingEndTime() != null);
        cuttingStatus.put("completionRate", order.getCuttingCompletionRate() != null ? order.getCuttingCompletionRate() : 0);
        cuttingStatus.put("completedQuantity", cuttingQty);
        cuttingStatus.put("remainingQuantity", orderQty - cuttingQty);
        cuttingStatus.put("operatorName", order.getCuttingOperatorName());
        cuttingStatus.put("startTime", order.getCuttingStartTime());
        cuttingStatus.put("completedTime", order.getCuttingEndTime());
        cuttingStatus.put("bundleCount", order.getCuttingBundleCount());
        allStatus.put("cutting", cuttingStatus);

        // 2. 车缝工序状态
        Map<String, Object> sewingStatus = new LinkedHashMap<>();
        sewingStatus.put("completed", order.getSewingEndTime() != null);
        sewingStatus.put("completionRate", order.getSewingCompletionRate() != null ? order.getSewingCompletionRate() : 0);
        sewingStatus.put("completedQuantity", warehousingQty);
        sewingStatus.put("remainingQuantity", cuttingQty - warehousingQty);
        sewingStatus.put("operatorName", order.getSewingOperatorName());
        sewingStatus.put("startTime", order.getSewingStartTime());
        sewingStatus.put("completedTime", order.getSewingEndTime());
        allStatus.put("sewing", sewingStatus);

        // 3. 尾部工序状态
        Map<String, Object> finishingStatus = new LinkedHashMap<>();
        finishingStatus.put("completed", order.getQualityEndTime() != null);
        finishingStatus.put("completionRate", order.getQualityCompletionRate() != null ? order.getQualityCompletionRate() : 0);
        finishingStatus.put("completedQuantity", warehousingQty);
        finishingStatus.put("remainingQuantity", cuttingQty - warehousingQty);
        finishingStatus.put("operatorName", order.getQualityOperatorName());
        finishingStatus.put("startTime", order.getQualityStartTime());
        finishingStatus.put("completedTime", order.getQualityEndTime());
        allStatus.put("finishing", finishingStatus);

        // 4. 入库工序状态
        Map<String, Object> warehousingStatus = new LinkedHashMap<>();
        warehousingStatus.put("completed", order.getWarehousingEndTime() != null);
        warehousingStatus.put("completionRate", order.getWarehousingCompletionRate() != null ? order.getWarehousingCompletionRate() : 0);
        warehousingStatus.put("completedQuantity", warehousingQty);
        warehousingStatus.put("remainingQuantity", cuttingQty - warehousingQty);
        warehousingStatus.put("operatorName", order.getWarehousingOperatorName());
        warehousingStatus.put("startTime", order.getWarehousingStartTime());
        warehousingStatus.put("completedTime", order.getWarehousingEndTime());
        allStatus.put("warehousing", warehousingStatus);

        log.info("Retrieved all process status for order: orderId={}, cutting={}%, sewing={}%, finishing={}%, warehousing={}%",
                 orderId,
                 cuttingStatus.get("completionRate"),
                 sewingStatus.get("completionRate"),
                 finishingStatus.get("completionRate"),
                 warehousingStatus.get("completionRate"));

        return allStatus;
    }
}
