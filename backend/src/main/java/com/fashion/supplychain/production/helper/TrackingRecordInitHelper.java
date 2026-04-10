package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.exception.BusinessException;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
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
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 工序跟踪记录初始化辅助类
 *
 * 职责：裁剪完成时生成 菲号×工序 跟踪记录、追加新菲号跟踪记录、解析工序节点配置
 * 从 ProductionProcessTrackingOrchestrator 拆分而来
 */
@Slf4j
@Component
public class TrackingRecordInitHelper {

    @Autowired
    private ProductionProcessTrackingService trackingService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    /**
     * 初始化工序跟踪记录（裁剪完成时调用）
     * 生成逻辑：菲号 × 工序 = N条记录
     */
    public int initializeProcessTracking(String productionOrderId) {
        log.info("开始初始化工序跟踪记录，订单ID: {}", productionOrderId);

        ProductionOrder order = productionOrderService.getById(productionOrderId);
        if (order == null) {
            throw new BusinessException("订单不存在：" + productionOrderId);
        }

        List<CuttingBundle> bundles = cuttingBundleService.lambdaQuery()
                .eq(CuttingBundle::getProductionOrderId, productionOrderId)
                .list();
        if (CollectionUtils.isEmpty(bundles)) {
            log.warn("订单 {} 没有裁剪单，跳过初始化", order.getOrderNo());
            return 0;
        }

        List<Map<String, Object>> processNodes = parseProcessNodes(order);
        if (CollectionUtils.isEmpty(processNodes)) {
            log.warn("订单 {} 没有配置工序节点，跳过初始化", order.getOrderNo());
            return 0;
        }

        ensureCuttingNode(processNodes, order);

        int deletedCount = trackingService.deleteByOrderNo(order.getOrderNo());
        if (deletedCount > 0) {
            log.info("订单 {} 删除老的跟踪记录 {} 条", order.getOrderNo(), deletedCount);
        }

        Map<String, CuttingTask> taskBySizeKey = new HashMap<>();
        CuttingTask anyReceivedTask = buildTaskIndex(productionOrderId, taskBySizeKey);

        List<ProductionProcessTracking> trackingRecords = buildTrackingRecords(
                order, bundles, processNodes, taskBySizeKey, anyReceivedTask);

        int count = trackingService.batchInsert(trackingRecords);
        log.info("订单 {} 初始化完成：{} 个菲号 × {} 个工序 = {} 条跟踪记录",
                order.getOrderNo(), bundles.size(), processNodes.size(), count);
        return count;
    }

    /**
     * 追加新菲号的工序跟踪记录（增量初始化）
     */
    public int appendProcessTracking(String productionOrderId, List<CuttingBundle> bundles) {
        if (!StringUtils.hasText(productionOrderId) || CollectionUtils.isEmpty(bundles)) {
            return 0;
        }
        ProductionOrder order = productionOrderService.getById(productionOrderId);
        if (order == null) {
            throw new BusinessException("订单不存在：" + productionOrderId);
        }
        List<CuttingBundle> targets = bundles.stream()
                .filter(b -> b != null && StringUtils.hasText(b.getId()))
                .filter(b -> CollectionUtils.isEmpty(trackingService.getByBundleId(b.getId())))
                .collect(Collectors.toList());
        if (targets.isEmpty()) {
            return 0;
        }

        List<Map<String, Object>> processNodes = parseProcessNodes(order);
        if (CollectionUtils.isEmpty(processNodes)) {
            return 0;
        }

        ensureCuttingNode(processNodes, order);

        Map<String, CuttingTask> taskBySizeKey = new HashMap<>();
        CuttingTask anyReceivedTask = buildTaskIndex(productionOrderId, taskBySizeKey);

        List<ProductionProcessTracking> trackingRecords = buildTrackingRecords(
                order, targets, processNodes, taskBySizeKey, anyReceivedTask);

        if (trackingRecords.isEmpty()) {
            return 0;
        }
        return trackingService.batchInsert(trackingRecords);
    }

    // ========== 私有方法 ==========

    private void ensureCuttingNode(List<Map<String, Object>> processNodes, ProductionOrder order) {
        boolean hasCuttingNode = processNodes.stream()
                .anyMatch(n -> "裁剪".equals(getStringValue(n, "name", ""))
                        || "裁剪".equals(getStringValue(n, "progressStage", "")));
        if (hasCuttingNode) return;

        BigDecimal cuttingUnitPrice = BigDecimal.ZERO;
        try {
            Map<String, BigDecimal> prices = templateLibraryService.resolveProcessUnitPrices(order.getStyleNo());
            if (prices != null) {
                BigDecimal price = prices.get("裁剪");
                if (price != null && price.compareTo(BigDecimal.ZERO) > 0) {
                    cuttingUnitPrice = price;
                }
            }
        } catch (Exception e) {
            log.warn("获取裁剪单价失败: styleNo={}", order.getStyleNo(), e);
        }
        Map<String, Object> cuttingNode = new HashMap<>();
        cuttingNode.put("name", "裁剪");
        cuttingNode.put("progressStage", "裁剪");
        cuttingNode.put("unitPrice", cuttingUnitPrice);
        cuttingNode.put("_isCuttingAutoNode", true);
        processNodes.add(0, cuttingNode);
        log.info("订单 {} 自动添加裁剪节点到工序跟踪（单价={}）", order.getOrderNo(), cuttingUnitPrice);
    }

    private CuttingTask buildTaskIndex(String productionOrderId, Map<String, CuttingTask> taskBySizeKey) {
        CuttingTask anyReceivedTask = null;
        try {
            List<CuttingTask> allTasks = cuttingTaskService.lambdaQuery()
                    .eq(CuttingTask::getProductionOrderId, productionOrderId)
                    .list();
            for (CuttingTask t : allTasks) {
                String key = (t.getColor() == null ? "" : t.getColor().trim())
                        + "|" + (t.getSize() == null ? "" : t.getSize().trim());
                if (!taskBySizeKey.containsKey(key) || StringUtils.hasText(t.getReceiverName())) {
                    taskBySizeKey.put(key, t);
                }
                if (StringUtils.hasText(t.getReceiverName()) && anyReceivedTask == null) {
                    anyReceivedTask = t;
                }
            }
        } catch (Exception e) {
            log.warn("查询裁剪任务失败: orderId={}", productionOrderId, e);
        }
        return anyReceivedTask;
    }

    private List<ProductionProcessTracking> buildTrackingRecords(
            ProductionOrder order, List<CuttingBundle> bundles,
            List<Map<String, Object>> processNodes,
            Map<String, CuttingTask> taskBySizeKey, CuttingTask anyReceivedTask) {

        List<ProductionProcessTracking> records = new ArrayList<>();
        String currentUser = UserContext.username() != null ? UserContext.username() : "system";

        for (CuttingBundle bundle : bundles) {
            String bundleKey = (bundle.getColor() == null ? "" : bundle.getColor().trim())
                    + "|" + (bundle.getSize() == null ? "" : bundle.getSize().trim());
            CuttingTask matchedTask = taskBySizeKey.getOrDefault(bundleKey, anyReceivedTask);

            for (int i = 0; i < processNodes.size(); i++) {
                Map<String, Object> node = processNodes.get(i);
                ProductionProcessTracking tracking = new ProductionProcessTracking();

                tracking.setId(java.util.UUID.randomUUID().toString().replace("-", ""));
                tracking.setProductionOrderId(order.getId());
                tracking.setProductionOrderNo(order.getOrderNo());
                tracking.setCuttingBundleId(bundle.getId());
                tracking.setBundleNo(bundle.getBundleNo());
                tracking.setSku(bundle.getStyleNo() + "-" + bundle.getColor() + "-" + bundle.getSize());
                tracking.setColor(bundle.getColor());
                tracking.setSize(bundle.getSize());
                tracking.setQuantity(bundle.getQuantity());

                String processName = getStringValue(node, "name", "工序" + (i + 1));
                tracking.setProcessCode(processName);
                tracking.setProcessName(processName);
                tracking.setProcessOrder(i + 1);
                tracking.setUnitPrice(getBigDecimalValue(node, "unitPrice", BigDecimal.ZERO));

                boolean isCuttingProcess = "裁剪".equals(processName)
                        || Boolean.TRUE.equals(node.get("_isCuttingAutoNode"));
                if (isCuttingProcess) {
                    tracking.setScanStatus("scanned");
                    if (matchedTask != null) {
                        tracking.setScanTime(matchedTask.getBundledTime() != null
                                ? matchedTask.getBundledTime() : LocalDateTime.now());
                        tracking.setOperatorName(StringUtils.hasText(matchedTask.getReceiverName())
                                ? matchedTask.getReceiverName() : currentUser);
                        tracking.setOperatorId(matchedTask.getReceiverId());
                    } else {
                        tracking.setScanTime(LocalDateTime.now());
                        tracking.setOperatorName(currentUser);
                    }
                    if (tracking.getUnitPrice() != null && tracking.getQuantity() != null
                            && tracking.getUnitPrice().compareTo(BigDecimal.ZERO) > 0) {
                        tracking.setSettlementAmount(
                                tracking.getUnitPrice().multiply(new BigDecimal(tracking.getQuantity())));
                    }
                } else {
                    tracking.setScanStatus("pending");
                }
                tracking.setIsSettled(false);
                tracking.setCreator(currentUser);
                tracking.setTenantId(UserContext.tenantId());
                records.add(tracking);
            }
        }
        return records;
    }

    /**
     * 解析订单的工序节点配置（公开方法，供 Orchestrator 和 PriceSyncHelper 复用）
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> parseProcessNodes(ProductionOrder order) {
        String workflowJson = order.getProgressWorkflowJson();
        List<Map<String, Object>> nodes = new ArrayList<>();

        if (workflowJson == null || workflowJson.trim().isEmpty()) {
            log.warn("订单 {} 没有工艺流程配置 (progressWorkflowJson 为空)，尝试从模板库兜底", order.getOrderNo());
            if (StringUtils.hasText(order.getStyleNo())) {
                try {
                    List<Map<String, Object>> templateNodes =
                            templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
                    if (templateNodes != null && !templateNodes.isEmpty()) {
                        Set<String> seenNames = new HashSet<>();
                        for (Map<String, Object> node : templateNodes) {
                            String stage = getStringValue(node, "progressStage", "");
                            if ("采购".equals(stage) || "procurement".equals(stage)) continue;
                            String name = getStringValue(node, "name", "");
                            if (StringUtils.hasText(name) && !seenNames.add(name)) {
                                log.warn("订单 {} 模板工序中发现重复工序「{}」，已跳过", order.getOrderNo(), name);
                                continue;
                            }
                            nodes.add(node);
                        }
                        log.info("订单 {} 从模板库兜底获取 {} 个工序节点（styleNo={}）",
                                order.getOrderNo(), nodes.size(), order.getStyleNo());
                    }
                } catch (Exception e) {
                    log.warn("订单 {} 从模板库获取工序节点失败: {}", order.getOrderNo(), e.getMessage());
                }
            }
            return nodes;
        }

        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> workflow = mapper.readValue(workflowJson, Map.class);
            Object nodesObj = workflow.get("nodes");
            if (nodesObj instanceof List) {
                List<Map<String, Object>> nodeList = (List<Map<String, Object>>) nodesObj;
                Set<String> seenNames = new HashSet<>();
                for (Map<String, Object> node : nodeList) {
                    String progressStage = getStringValue(node, "progressStage", "");
                    if ("采购".equals(progressStage) || "procurement".equals(progressStage)) {
                        continue;
                    }
                    String name = getStringValue(node, "name", "");
                    if (StringUtils.hasText(name) && !seenNames.add(name)) {
                        log.warn("订单 {} 工序配置中发现重复工序「{}」，已跳过（保留首次出现）", order.getOrderNo(), name);
                        continue;
                    }
                    nodes.add(node);
                }
                log.info("订单 {} 解析工序配置成功：共 {} 个工序", order.getOrderNo(), nodes.size());
            } else {
                log.warn("订单 {} 的 progressWorkflowJson 格式错误：nodes 不是数组", order.getOrderNo());
            }
        } catch (Exception e) {
            log.error("订单 {} 解析工艺流程JSON失败", order.getOrderNo(), e);
        }
        return nodes;
    }

    public String getStringValue(Map<String, Object> map, String key, String defaultValue) {
        Object value = map.get(key);
        return value != null ? value.toString() : defaultValue;
    }

    public BigDecimal getBigDecimalValue(Map<String, Object> map, String key, BigDecimal defaultValue) {
        Object value = map.get(key);
        if (value == null) return defaultValue;
        if (value instanceof BigDecimal) return (BigDecimal) value;
        if (value instanceof Number) return new BigDecimal(value.toString());
        try {
            return new BigDecimal(value.toString());
        } catch (Exception e) {
            return defaultValue;
        }
    }
}
