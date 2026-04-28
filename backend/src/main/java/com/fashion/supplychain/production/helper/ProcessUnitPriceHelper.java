package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.*;

@Component
@Slf4j
public class ProcessUnitPriceHelper {

    private static final Set<String> NON_PAYABLE_PROCESSES = new HashSet<>(Arrays.asList(
            "采购", "下单", "订单创建", "接单", "入库", "成品入库", "验收",
            "procurement", "order", "warehousing", "receiving"
    ));

    private static final List<String> STAGE_ORDER = List.of("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private TemplateLibraryService templateLibraryService;

    public List<Map<String, Object>> getProcessUnitPrices(String orderNo) {
        List<Map<String, Object>> result = new ArrayList<>();
        try {
            if (!StringUtils.hasText(orderNo)) {
                log.warn("[ProcessUnitPrice] 订单号为空");
                return result;
            }

            ProductionOrder order = productionOrderService.getOne(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getOrderNo, orderNo)
                            .eq(ProductionOrder::getDeleteFlag, 0)
                            .last("LIMIT 1"));

            if (order == null) {
                log.warn("[ProcessUnitPrice] 订单不存在 - orderNo: {}", orderNo);
                return result;
            }

            String workflowJson = order.getProgressWorkflowJson();
            if (!StringUtils.hasText(workflowJson)) {
                log.warn("[ProcessUnitPrice] 订单无工序配置 - orderNo: {}", orderNo);
                return result;
            }

            log.info("[ProcessUnitPrice] 开始解析工序单价 - orderNo: {}, json长度: {}", orderNo, workflowJson.length());

            List<Map<String, Object>> nodes = parseWorkflowNodes(workflowJson);
            if (nodes == null || nodes.isEmpty()) {
                log.warn("[ProcessUnitPrice] workflow.nodes为空 - orderNo: {}", orderNo);
                return result;
            }

            log.info("[ProcessUnitPrice] 找到 {} 个工序节点", nodes.size());

            collectPriceInfoFromNodes(nodes, result);

            log.debug("[ProcessUnitPrice] 获取工序单价配置完成 - orderNo: {}, 成功解析: {} 个", orderNo, result.size());

            mergeTemplateStageMapping(order, result);
            inferAndAssignScanType(result);
            sortByStageAndId(result);

            return result;

        } catch (Exception e) {
            log.error("[ProcessUnitPrice] 获取工序单价配置失败 - orderNo: {}", orderNo, e);
            return result;
        }
    }

    public Map<String, Object> getUnitPriceByProcess(String orderNo, String processName) {
        Map<String, Object> result = new HashMap<>();
        result.put("processName", processName);
        result.put("unitPrice", 0.0);
        result.put("found", false);

        try {
            if (!StringUtils.hasText(orderNo) || !StringUtils.hasText(processName)) {
                log.warn("[ProcessUnitPrice] 订单号或工序名为空 - orderNo: {}, processName: {}", orderNo, processName);
                return result;
            }

            log.debug("[ProcessUnitPrice] 查询工序单价 - orderNo: {}, processName: '{}'", orderNo, processName);

            List<Map<String, Object>> prices = getProcessUnitPrices(orderNo);

            log.debug("[ProcessUnitPrice] 获取到 {} 个工序配置", prices.size());

            for (Map<String, Object> priceInfo : prices) {
                String name = String.valueOf(priceInfo.getOrDefault("name", "")).trim();
                String id = String.valueOf(priceInfo.getOrDefault("id", "")).trim();

                log.info("[ProcessUnitPrice] 比较工序 - id: '{}', name: '{}', processName: '{}'", id, name, processName);

                if (name.equalsIgnoreCase(processName)) {
                    Object unitPrice = priceInfo.get("unitPrice");
                    result.put("unitPrice", unitPrice != null ? Double.parseDouble(unitPrice.toString()) : 0.0);
                    result.put("found", true);
                    result.put("matchBy", "name");
                    log.info("[ProcessUnitPrice] 通过名称匹配成功 - name: '{}', unitPrice: {}", name, unitPrice);
                    break;
                }

                if (StringUtils.hasText(id) && id.equalsIgnoreCase(processName)) {
                    Object unitPrice = priceInfo.get("unitPrice");
                    result.put("unitPrice", unitPrice != null ? Double.parseDouble(unitPrice.toString()) : 0.0);
                    result.put("found", true);
                    result.put("matchBy", "id");
                    log.warn("[ProcessUnitPrice] ⚠️ 通过ID匹配成功（名称可能乱码）- id: '{}', unitPrice: {}", id, unitPrice);
                    break;
                }

                if (StringUtils.hasText(processName)) {
                    String pn = processName.toLowerCase();
                    String n = name.toLowerCase();
                    if ((pn.contains("裁剪") || pn.contains("裁") || pn.contains("cutting")) &&
                        (n.contains("裁剪") || n.contains("裁") || n.contains("cutting") || n.equals("??"))) {
                        Object unitPrice = priceInfo.get("unitPrice");
                        if (unitPrice != null && Double.parseDouble(unitPrice.toString()) > 0) {
                            result.put("unitPrice", Double.parseDouble(unitPrice.toString()));
                            result.put("found", true);
                            result.put("matchBy", "fuzzy");
                            log.warn("[ProcessUnitPrice] ⚠️ 通过模糊匹配裁剪工序 - processName: '{}', unitPrice: {}", processName, unitPrice);
                            break;
                        }
                    }
                }
            }

            log.debug("[ProcessUnitPrice] 查询工序单价完成 - orderNo: {}, processName: {}, found: {}, unitPrice: {}, matchBy: {}",
                    orderNo, processName, result.get("found"), result.get("unitPrice"), result.getOrDefault("matchBy", "none"));

        } catch (Exception e) {
            log.error("[ProcessUnitPrice] 获取工序单价失败 - orderNo: {}, processName: {}", orderNo, processName, e);
        }

        return result;
    }

    public boolean attachProcessUnitPrice(ScanRecord scanRecord) {
        try {
            if (scanRecord == null || !StringUtils.hasText(scanRecord.getProcessName())) {
                log.warn("[ProcessUnitPrice] 扫码记录或工序名为空");
                return false;
            }

            String orderNo = scanRecord.getOrderNo();
            String processName = scanRecord.getProcessName();

            log.info("[ProcessUnitPrice] 开始附加工序单价 - orderNo: {}, processName: '{}'", orderNo, processName);

            if (isNonPayableProcess(processName)) {
                log.info("[ProcessUnitPrice] 跳过无工资工序 - processName: '{}'（采购/下单/入库等管理类工序）", processName);
                scanRecord.setProcessUnitPrice(BigDecimal.ZERO);
                scanRecord.setScanCost(BigDecimal.ZERO);
                scanRecord.setUnitPrice(BigDecimal.ZERO);
                scanRecord.setTotalAmount(BigDecimal.ZERO);
                return true;
            }

            BigDecimal unitPrice = resolveUnitPrice(orderNo, processName, scanRecord);
            applyPriceToScanRecord(scanRecord, unitPrice);

            log.info("[ProcessUnitPrice] 附加工序单价完成 - processName: {}, unitPrice: {}, quantity: {}, scanCost: {}",
                    scanRecord.getProcessName(), unitPrice, scanRecord.getQuantity(), scanRecord.getScanCost());

            return true;
        } catch (Exception e) {
            log.error("[ProcessUnitPrice] 附加工序单价失败", e);
            return false;
        }
    }

    public Map<String, Object> calculateOrderTotalCost(String orderNo) {
        Map<String, Object> result = new HashMap<>();
        result.put("orderNo", orderNo);
        result.put("totalUnitPrice", 0.0);
        result.put("totalCost", 0.0);
        result.put("quantity", 0);

        try {
            if (!StringUtils.hasText(orderNo)) {
                log.warn("[ProcessUnitPrice] 订单号为空");
                return result;
            }

            List<Map<String, Object>> processPrices = getProcessUnitPrices(orderNo);

            double totalUnitPrice = 0.0;
            for (Map<String, Object> priceInfo : processPrices) {
                Object unitPrice = priceInfo.get("unitPrice");
                if (unitPrice != null) {
                    try {
                        totalUnitPrice += Double.parseDouble(unitPrice.toString());
                    } catch (Exception e) {
                        log.warn("[ProcessUnitPrice] 工序单价转换失败: {}", unitPrice);
                    }
                }
            }

            int orderQuantity = 0;

            double totalCost = totalUnitPrice * orderQuantity;

            result.put("totalUnitPrice", totalUnitPrice);
            result.put("totalCost", totalCost);
            result.put("quantity", orderQuantity);

            log.debug("[ProcessUnitPrice] 计算订单总工价 - orderNo: {}, totalUnitPrice: {}, totalCost: {}",
                    orderNo, totalUnitPrice, totalCost);

        } catch (Exception e) {
            log.error("[ProcessUnitPrice] 计算订单总工价失败 - orderNo: {}", orderNo, e);
        }

        return result;
    }

    public boolean isNonPayableProcess(String processName) {
        if (!StringUtils.hasText(processName)) {
            return false;
        }
        String pn = processName.trim().toLowerCase();

        for (String nonPayable : NON_PAYABLE_PROCESSES) {
            if (pn.equalsIgnoreCase(nonPayable)) {
                return true;
            }
        }

        return pn.contains("采购") || pn.contains("下单") || pn.contains("入库") ||
               pn.contains("procurement") || pn.contains("order") || pn.contains("warehousing");
    }

    public String inferScanTypeFromNames(String processName, String progressStage) {
        for (String raw : new String[]{processName, progressStage}) {
            if (!StringUtils.hasText(raw)) continue;
            String norm = com.fashion.supplychain.common.ProcessSynonymMapping.normalize(raw.trim());
            switch (norm) {
                case "入库": return "warehouse";
                case "裁剪": return "cutting";
                case "质检": return "quality";
                case "采购": return "procurement";
            }
        }
        return "production";
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseWorkflowNodes(String workflowJson) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Object> workflow = mapper.readValue(workflowJson, new TypeReference<Map<String, Object>>() {});
        log.info("[ProcessUnitPrice] JSON解析成功 - keys: {}", workflow.keySet());
        return (List<Map<String, Object>>) workflow.get("nodes");
    }

    private void collectPriceInfoFromNodes(List<Map<String, Object>> nodes, List<Map<String, Object>> result) {
        for (Map<String, Object> node : nodes) {
            String processId = String.valueOf(node.getOrDefault("id", "")).trim();
            String processName = String.valueOf(node.getOrDefault("name", "")).trim();
            Object unitPriceObj = node.get("unitPrice");
            String progressStage = String.valueOf(node.getOrDefault("progressStage", "")).trim();

            log.info("[ProcessUnitPrice] 处理工序 - id: {}, name: {}, unitPrice: {}, progressStage: {}, nodeKeys: {}",
                    processId, processName, unitPriceObj, progressStage, node.keySet());

            if (unitPriceObj != null) {
                Map<String, Object> priceInfo = new HashMap<>();

                if (StringUtils.hasText(processId)) {
                    priceInfo.put("id", processId);
                }
                if (StringUtils.hasText(processName)) {
                    priceInfo.put("name", processName);
                    priceInfo.put("processName", processName);
                }
                if (StringUtils.hasText(progressStage)) {
                    priceInfo.put("progressStage", progressStage);
                }

                try {
                    double unitPrice = Double.parseDouble(unitPriceObj.toString());
                    priceInfo.put("unitPrice", unitPrice);
                    priceInfo.put("price", unitPrice);
                    extractSortOrder(node, priceInfo);
                    extractScanType(node, priceInfo);

                    if (StringUtils.hasText(processId) || StringUtils.hasText(processName)) {
                        result.add(priceInfo);
                        log.info("[ProcessUnitPrice] 添加工序单价 - id: {}, processName: {}, unitPrice: {}",
                                processId, processName, unitPrice);
                    }
                } catch (NumberFormatException e) {
                    log.warn("[ProcessUnitPrice] 工序单价格式错误 - id: {}, processName: {}, unitPrice: {}",
                            processId, processName, unitPriceObj);
                }
            } else {
                log.warn("[ProcessUnitPrice] 跳过工序（无单价）- id: {}, processName: {}", processId, processName);
            }
        }
    }

    private void extractSortOrder(Map<String, Object> node, Map<String, Object> priceInfo) {
        Object sortOrderObj = node.get("sortOrder");
        if (sortOrderObj != null) {
            try { priceInfo.put("sortOrder", Integer.parseInt(sortOrderObj.toString())); }
            catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
        }
    }

    private void extractScanType(Map<String, Object> node, Map<String, Object> priceInfo) {
        Object scanTypeObj = node.get("scanType");
        if (scanTypeObj != null && StringUtils.hasText(scanTypeObj.toString())) {
            priceInfo.put("scanType", scanTypeObj.toString());
        }
    }

    private void mergeTemplateStageMapping(ProductionOrder order, List<Map<String, Object>> result) {
        if (templateLibraryService == null || order.getStyleNo() == null) {
            return;
        }
        try {
            List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
            if (templateNodes == null || templateNodes.isEmpty()) {
                return;
            }
            Map<String, String> stageMap = new HashMap<>();
            for (Map<String, Object> tn : templateNodes) {
                String tnName = tn.get("name") != null ? tn.get("name").toString().trim() : "";
                String tnStage = tn.get("progressStage") != null ? tn.get("progressStage").toString().trim() : "";
                if (StringUtils.hasText(tnName) && StringUtils.hasText(tnStage)) {
                    stageMap.put(tnName, tnStage);
                }
            }
            for (Map<String, Object> r : result) {
                String pn = r.get("processName") != null ? r.get("processName").toString() : "";
                if (StringUtils.hasText(pn) && stageMap.containsKey(pn) && !r.containsKey("progressStage")) {
                    r.put("progressStage", stageMap.get(pn));
                }
            }
            log.info("[ProcessUnitPrice] 合并progressStage映射完成 - 共{}个映射", stageMap.size());
        } catch (Exception e) {
            log.warn("[ProcessUnitPrice] 合并progressStage映射失败: {}", e.getMessage());
        }
    }

    private void inferAndAssignScanType(List<Map<String, Object>> result) {
        for (Map<String, Object> r : result) {
            String pn = r.get("processName") != null ? r.get("processName").toString() : "";
            String ps = r.get("progressStage") != null ? r.get("progressStage").toString() : "";
            r.put("scanType", inferScanTypeFromNames(pn, ps));
        }
    }

    private void sortByStageAndId(List<Map<String, Object>> result) {
        result.sort((a, b) -> {
            String stageA = String.valueOf(a.getOrDefault("progressStage", "")).trim();
            String stageB = String.valueOf(b.getOrDefault("progressStage", "")).trim();
            int idxA = STAGE_ORDER.indexOf(stageA);
            int idxB = STAGE_ORDER.indexOf(stageB);
            if (idxA == -1) idxA = 999;
            if (idxB == -1) idxB = 999;
            if (idxA != idxB) return idxA - idxB;
            String idA = String.valueOf(a.getOrDefault("id", "")).trim();
            String idB = String.valueOf(b.getOrDefault("id", "")).trim();
            int numA = parseSortNum(idA);
            int numB = parseSortNum(idB);
            if (numA != numB) return numA - numB;
            return idA.compareTo(idB);
        });
    }

    private static int parseSortNum(String id) {
        if (id == null || id.isEmpty()) return 9999;
        String digits = id.replaceAll("\\D", "");
        if (digits.isEmpty()) return 9999;
        try { return Integer.parseInt(digits); } catch (NumberFormatException e) { return 9999; }
    }

    private BigDecimal resolveUnitPrice(String orderNo, String processName, ScanRecord scanRecord) {
        Map<String, Object> priceInfo = getUnitPriceByProcess(orderNo, processName);
        BigDecimal unitPrice = parseBigDecimal(priceInfo.get("unitPrice"));

        if (unitPrice.compareTo(BigDecimal.ZERO) <= 0
                && StringUtils.hasText(scanRecord.getProgressStage())) {
            String stageName = scanRecord.getProgressStage().trim();
            if (!stageName.equalsIgnoreCase(processName.trim())) {
                BigDecimal stagePrice = tryResolveStagePrice(orderNo, stageName);
                if (stagePrice.compareTo(BigDecimal.ZERO) > 0) {
                    unitPrice = stagePrice;
                }
            }
        }
        return unitPrice;
    }

    private BigDecimal tryResolveStagePrice(String orderNo, String stageName) {
        Map<String, Object> stagePriceInfo = getUnitPriceByProcess(orderNo, stageName);
        return parseBigDecimal(stagePriceInfo.get("unitPrice"));
    }

    private BigDecimal parseBigDecimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(value.toString());
        } catch (Exception e) {
            log.warn("[ProcessUnitPrice] 单价转换失败: {}", value);
            return BigDecimal.ZERO;
        }
    }

    private void applyPriceToScanRecord(ScanRecord scanRecord, BigDecimal unitPrice) {
        scanRecord.setProcessUnitPrice(unitPrice);

        int qty = scanRecord.getQuantity() != null ? scanRecord.getQuantity() : 0;
        BigDecimal scanCost = unitPrice.multiply(new BigDecimal(qty));
        scanRecord.setScanCost(scanCost);

        BigDecimal currentUnitPrice = scanRecord.getUnitPrice();
        if ((currentUnitPrice == null || currentUnitPrice.compareTo(BigDecimal.ZERO) <= 0)
                && unitPrice.compareTo(BigDecimal.ZERO) > 0) {
            scanRecord.setUnitPrice(unitPrice);
        }

        BigDecimal currentTotalAmount = scanRecord.getTotalAmount();
        if ((currentTotalAmount == null || currentTotalAmount.compareTo(BigDecimal.ZERO) <= 0)
                && scanCost.compareTo(BigDecimal.ZERO) > 0) {
            scanRecord.setTotalAmount(scanCost);
        }
    }
}
