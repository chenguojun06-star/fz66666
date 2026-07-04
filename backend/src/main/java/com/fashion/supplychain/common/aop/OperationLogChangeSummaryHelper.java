package com.fashion.supplychain.common.aop;

import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerMapping;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 操作日志变更摘要与详情构建辅助类（P2#10 拆分自 SystemOperationLogAspect）
 * 职责：
 *   1. 生成结构化变更摘要（JSON 数组）
 *   2. 构建操作详情（PUT/POST/DELETE 请求参数提取）
 *   3. fallback：从 URI 查询实体名称
 *
 * 设计原则：
 *   - 纯工具方法，无 @Transactional
 *   - 不修改业务流程，不改 API 契约
 */
@Slf4j
@Component
public class OperationLogChangeSummaryHelper {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * 字段名 -> 中文标签映射（与 Aspect 共享，保持中文展示一致）
     */
    public static final Map<String, String> FIELD_LABEL_MAP = Map.ofEntries(
        Map.entry("styleNo", "款号"), Map.entry("styleName", "款式名称"), Map.entry("name", "名称"),
        Map.entry("code", "编码"), Map.entry("status", "状态"), Map.entry("orderNo", "订单号"),
        Map.entry("purchaseNo", "采购单号"), Map.entry("pickingNo", "领料单号"), Map.entry("bundleNo", "菲号"),
        Map.entry("materialName", "物料名称"), Map.entry("factoryName", "加工厂"),
        Map.entry("price", "单价"), Map.entry("unitPrice", "单价"), Map.entry("quantity", "数量"),
        Map.entry("amount", "金额"), Map.entry("totalAmount", "总金额"),
        Map.entry("sampleDevCost", "样衣开发费"), Map.entry("tagPrice", "吊牌价"),
        Map.entry("salesPrice", "销售价"), Map.entry("colorName", "颜色"), Map.entry("sizeName", "尺码"),
        Map.entry("customerName", "客户名称"), Map.entry("contactName", "联系人"),
        Map.entry("contactPhone", "联系电话"), Map.entry("address", "地址"),
        Map.entry("expectedShipDate", "预计交期"), Map.entry("approvalStatus", "审批状态"),
        Map.entry("remark", "备注"), Map.entry("categoryName", "品类"),
        Map.entry("fabricComposition", "面料成分"), Map.entry("season", "季节"),
        Map.entry("year", "年份"), Map.entry("brand", "品牌"),
        Map.entry("productionStatus", "生产状态"), Map.entry("sampleStatus", "样衣状态"),
        Map.entry("processStatus", "工序状态"), Map.entry("qualityStatus", "质检状态"),
        Map.entry("warehousingStatus", "入库状态"), Map.entry("paymentStatus", "付款状态"),
        Map.entry("cuttingNo", "裁剪编号"), Map.entry("warehouseOrderNo", "出库单号"),
        Map.entry("supplierName", "供应商名称"), Map.entry("materialCode", "物料编码"),
        Map.entry("spec", "规格"), Map.entry("unit", "单位"), Map.entry("color", "颜色"),
        Map.entry("size", "尺码"), Map.entry("weight", "重量"),
        Map.entry("width", "幅宽"), Map.entry("yardage", "码数"),
        Map.entry("pricePerUnit", "单价"), Map.entry("totalPrice", "总价"),
        Map.entry("deliveryDate", "交货日期"), Map.entry("orderDate", "下单日期"),
        Map.entry("finishDate", "完成日期"), Map.entry("shipDate", "发货日期"),
        Map.entry("receiveDate", "收货日期"), Map.entry("paymentDate", "付款日期"),
        Map.entry("invoiceNo", "发票号"), Map.entry("contractNo", "合同号"),
        Map.entry("purchaseDate", "采购日期"), Map.entry("inboundDate", "入库日期"),
        Map.entry("outboundDate", "出库日期"), Map.entry("warehouseName", "仓库名称"),
        Map.entry("locationName", "库位名称"), Map.entry("areaName", "库区名称"),
        Map.entry("description", "描述"), Map.entry("summary", "摘要"),
        Map.entry("type", "类型"), Map.entry("priority", "优先级"),
        Map.entry("source", "来源"), Map.entry("version", "版本"),
        Map.entry("enabled", "是否启用"), Map.entry("sortOrder", "排序"),
        Map.entry("isDefault", "是否默认")
    );

    /**
     * 生成结构化变更摘要（JSON 数组）。
     * 输出格式：[{"label":"款号","key":"styleNo","old":"A","new":"B"}, ...]
     * 前端按 JSON 解析后渲染为「标签：旧值 → 新值」，避免正则切分遇到 "->" 字符错位。
     */
    public String buildChangeSummary(Map<String, String> oldMap, Map<String, String> newMap, Set<String> sensitiveFields) {
        if (oldMap == null || newMap == null) return null;
        List<Map<String, String>> changes = new ArrayList<>();
        Set<String> allKeys = new LinkedHashSet<>(oldMap.keySet());
        allKeys.addAll(newMap.keySet());
        for (String key : allKeys) {
            if (sensitiveFields.contains(key)) continue;
            String oldVal = oldMap.get(key);
            String newVal = newMap.get(key);
            if (Objects.equals(oldVal, newVal)) continue;
            String label = FIELD_LABEL_MAP.getOrDefault(key, key);
            String oldDisp = oldVal != null ? oldVal : "(空)";
            String newDisp = newVal != null ? newVal : "(空)";
            if (oldDisp.length() > 80) oldDisp = oldDisp.substring(0, 80) + "...";
            if (newDisp.length() > 80) newDisp = newDisp.substring(0, 80) + "...";
            Map<String, String> entry = new LinkedHashMap<>();
            entry.put("label", label);
            entry.put("key", key);
            entry.put("old", oldDisp);
            entry.put("new", newDisp);
            changes.add(entry);
        }
        if (changes.isEmpty()) return null;
        try {
            return OBJECT_MAPPER.writeValueAsString(changes);
        } catch (Exception e) {
            log.debug("[OpLog] 序列化变更摘要失败", e);
            return null;
        }
    }

    /**
     * 构建操作详情（PUT/POST/DELETE 请求参数提取）
     */
    public String buildDetails(String method, Object[] args, HttpServletRequest request, Set<String> sensitiveFields) {
        if (args == null || args.length == 0) {
            return buildRequestDetails(request);
        }
        try {
            Map<String, Object> detailMap = new LinkedHashMap<>();

            if ("PUT".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method)) {
                for (Object arg : args) {
                    if (arg == null) continue;
                    if (arg instanceof String || arg instanceof Number || arg instanceof Boolean) continue;
                    if (arg instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> map = (Map<String, Object>) arg;
                        extractKeyFields(detailMap, map, sensitiveFields);
                    } else {
                        extractObjectFields(detailMap, arg, sensitiveFields);
                    }
                }
            } else if ("POST".equalsIgnoreCase(method)) {
                for (Object arg : args) {
                    if (arg == null) continue;
                    if (arg instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> map = (Map<String, Object>) arg;
                        String[] keyFields = {
                            "id", "orderId", "styleId", "purchaseId", "pickingId", "cuttingBundleId",
                            "orderNo", "styleNo", "purchaseNo", "pickingNo", "bundleNo",
                            "name", "code", "materialName", "status", "expectedShipDate",
                            "reason", "remark", "remarks", "quantity"
                        };
                        for (String key : keyFields) {
                            if (map.containsKey(key)) {
                                Object value = map.get(key);
                                if (value != null) {
                                    if (sensitiveFields.contains(key)) {
                                        detailMap.put(key, "***");
                                    } else {
                                        detailMap.put(key, value);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            enrichDetailsFromRequest(detailMap, request);
            if (detailMap.isEmpty()) return null;
            return OBJECT_MAPPER.writeValueAsString(detailMap);
        } catch (Exception e) {
            return null;
        }
    }

    private void extractKeyFields(Map<String, Object> detailMap, Map<String, Object> source, Set<String> sensitiveFields) {
        String[] importantFields = {
            "id", "orderNo", "styleNo", "name", "code", "status",
            "price", "unitPrice", "quantity", "amount", "totalAmount",
            "oldPrice", "newPrice", "oldStatus", "newStatus",
            "reason", "remark", "remarks", "approvalStatus", "expectedShipDate",
            "purchaseId", "purchaseNo", "pickingId", "pickingNo", "bundleNo",
            "orderId", "styleId", "materialName", "factoryName"
        };
        for (String field : importantFields) {
            if (source.containsKey(field)) {
                Object value = source.get(field);
                if (value != null) {
                    if (sensitiveFields.contains(field)) {
                        detailMap.put(field, "***");
                    } else {
                        detailMap.put(field, value);
                    }
                }
            }
        }
    }

    private void extractObjectFields(Map<String, Object> detailMap, Object obj, Set<String> sensitiveFields) {
        try {
            String[] getterNames = {
                "getId", "getOrderNo", "getStyleNo", "getName", "getCode",
                "getPrice", "getUnitPrice", "getQuantity", "getAmount",
                "getOldPrice", "getNewPrice", "getStatus", "getReason", "getRemark"
            };
            Class<?> clazz = obj.getClass();
            for (String methodName : getterNames) {
                try {
                    var method = clazz.getMethod(methodName);
                    Object value = method.invoke(obj);
                    if (value != null) {
                        String fieldName = methodName.substring(3, 4).toLowerCase() + methodName.substring(4);
                        if (sensitiveFields.contains(fieldName)) {
                            detailMap.put(fieldName, "***");
                        } else {
                            detailMap.put(fieldName, value);
                        }
                    }
                } catch (NoSuchMethodException e) {
                    log.trace("[OpLog] 反射方法不存在，跳过: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.trace("[OpLog] 反射提取字段失败: {}", e.getMessage());
        }
    }

    private void enrichDetailsFromRequest(Map<String, Object> detailMap, HttpServletRequest request) {
        if (detailMap == null || request == null) return;
        Object pathVariableAttr = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (pathVariableAttr instanceof Map) {
            Map<?, ?> pathVariables = (Map<?, ?>) pathVariableAttr;
            for (String key : new String[]{"id", "orderId", "transferId", "trackingId", "productionOrderId"}) {
                Object value = pathVariables.get(key);
                if (value != null) {
                    detailMap.putIfAbsent(key, value);
                }
            }
        }
        for (String key : new String[]{
                "reason", "remark", "action", "stage", "orderNo", "purchaseId",
                "purchaseNo", "pickingId", "pickingNo", "expectedShipDate"
        }) {
            String value = request.getParameter(key);
            if (value != null && !value.isBlank()) {
                detailMap.putIfAbsent(key, value.trim());
            }
        }
    }

    private String buildRequestDetails(HttpServletRequest request) {
        try {
            Map<String, Object> detailMap = new LinkedHashMap<>();
            enrichDetailsFromRequest(detailMap, request);
            if (detailMap.isEmpty()) return null;
            return OBJECT_MAPPER.writeValueAsString(detailMap);
        } catch (Exception ignored) {
            log.debug("[OpLog] serializeDetails序列化失败");
            return null;
        }
    }
}
