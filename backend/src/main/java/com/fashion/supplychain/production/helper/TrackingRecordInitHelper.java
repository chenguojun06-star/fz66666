package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.BusinessException;
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
import java.util.Collections;
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
     * 追加/同步菲号的工序跟踪记录（增量补建 + 清理多余）
     * <p>
     * 支持两种场景（用户在工艺流程编辑器中修改工序后）：
     * <ul>
     *   <li><b>新增工序</b>：为已有菲号补建缺失的工序 tracking 记录</li>
     *   <li><b>减少工序</b>：将已删除工序的 pending tracking 记录物理删除；
     *       scanned 状态的保留（避免丢失工资数据），由管理员手动处理</li>
     * </ul>
     * <p>
     * <b>注意</b>：旧逻辑是"全有或全无"——只要菲号有任何 tracking 记录就跳过整个菲号，
     * 导致新增工序永远补不上。现改为按工序名/编号逐个判断。
     *
     * @param productionOrderId 订单ID
     * @param bundles 涉及的菲号列表
     * @return 本次新插入的 tracking 记录数
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

        int insertedCount = 0;
        int deletedCount = 0;
        int scannedObsoleteRetained = 0;

        for (CuttingBundle bundle : targets) {
            List<ProductionProcessTracking> existing = trackingService.getByBundleId(bundle.getId());

            // 1. 清理已被前端工艺流程删除的工序（减少工序场景）
            int[] obsoleteStats = removeObsoleteProcessTracking(bundle, processNodes, existing);
            deletedCount += obsoleteStats[0];
            scannedObsoleteRetained += obsoleteStats[1];

            // 2. 补建新增工序的 tracking 记录（新增工序场景）
            List<ProductionProcessTracking> toInsert = buildTrackingRecordsForMissing(
                    order, bundle, processNodes, taskBySizeKey, anyReceivedTask, existing);
            if (!toInsert.isEmpty()) {
                insertedCount += trackingService.batchInsert(toInsert);
            }
        }

        if (insertedCount > 0 || deletedCount > 0) {
            log.info("订单 {} 工序跟踪同步：补建 {} 条，清理 pending {} 条，保留 scanned废弃 {} 条（涉及 {} 个菲号）",
                    order.getOrderNo(), insertedCount, deletedCount, scannedObsoleteRetained, targets.size());
        }
        return insertedCount;
    }

    /**
     * 清理已被前端工艺流程删除的工序跟踪记录（减少工序场景）。
     * <p>
     * 策略：
     * <ul>
     *   <li><b>pending 状态</b>（未扫码）：直接物理删除，无扫码数据丢失风险</li>
     *   <li><b>scanned/reset 状态</b>（已扫码/已重置）：保留，避免丢失工资数据，由管理员手动处理</li>
     * </ul>
     *
     * @param bundle 菲号
     * @param processNodes 当前工艺流程节点列表
     * @param existing 该菲号已有的 tracking 记录
     * @return int[2]：[0]=删除的 pending 条数，[1]=保留的 scanned 废弃条数
     */
    private int[] removeObsoleteProcessTracking(CuttingBundle bundle,
                                                List<Map<String, Object>> processNodes,
                                                List<ProductionProcessTracking> existing) {
        if (CollectionUtils.isEmpty(existing)) {
            return new int[]{0, 0};
        }
        Set<String> currentNodeNames = processNodes.stream()
                .map(n -> getStringValue(n, "name", "").trim())
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        Set<String> currentNodeCodes = processNodes.stream()
                .map(n -> getStringValue(n, "processCode",
                        getStringValue(n, "code", "")).trim())
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        List<ProductionProcessTracking> pendingObsolete = new ArrayList<>();
        int scannedObsolete = 0;
        for (ProductionProcessTracking t : existing) {
            String name = t.getProcessName() == null ? "" : t.getProcessName().trim();
            String code = t.getProcessCode() == null ? "" : t.getProcessCode().trim();
            boolean nameMatched = StringUtils.hasText(name) && currentNodeNames.contains(name);
            boolean codeMatched = StringUtils.hasText(code) && currentNodeCodes.contains(code);
            if (nameMatched || codeMatched) {
                continue;  // 工序仍在当前工艺流程中
            }
            // 工序已被前端删除
            if ("pending".equals(t.getScanStatus())) {
                pendingObsolete.add(t);
            } else {
                scannedObsolete++;
            }
        }

        if (!pendingObsolete.isEmpty()) {
            List<String> idsToRemove = pendingObsolete.stream()
                    .map(ProductionProcessTracking::getId)
                    .collect(Collectors.toList());
            boolean removed = trackingService.removeByIds(idsToRemove);
            if (removed) {
                log.info("[工序同步-减少] 菲号#{} 清理 {} 条 pending tracking 记录（工序已被前端删除）：{}",
                        bundle.getBundleNo(), pendingObsolete.size(),
                        pendingObsolete.stream()
                                .map(t -> t.getProcessName() + "/" + t.getProcessCode())
                                .collect(Collectors.joining(", ")));
            }
        }
        if (scannedObsolete > 0) {
            log.warn("[工序同步-减少] 菲号#{} 保留 {} 条 scanned 废弃 tracking 记录（已扫码，避免丢失工资数据）",
                    bundle.getBundleNo(), scannedObsolete);
        }
        return new int[]{pendingObsolete.size(), scannedObsolete};
    }

    /**
     * 为缺失的工序构建 tracking 记录（新增工序场景）。
     * <p>
     * 对比当前 processNodes 与已有 tracking 记录，只为缺失的工序构建新记录。
     *
     * @param order 生产订单
     * @param bundle 菲号
     * @param processNodes 当前工艺流程节点列表
     * @param taskBySizeKey 裁剪任务索引（按 color|size）
     * @param anyReceivedTask 任意已领取的裁剪任务（兜底用）
     * @param existing 该菲号已有的 tracking 记录
     * @return 待插入的 tracking 记录列表（可能为空）
     */
    private List<ProductionProcessTracking> buildTrackingRecordsForMissing(
            ProductionOrder order, CuttingBundle bundle,
            List<Map<String, Object>> processNodes,
            Map<String, CuttingTask> taskBySizeKey, CuttingTask anyReceivedTask,
            List<ProductionProcessTracking> existing) {

        Set<String> existingNames = existing.stream()
                .map(t -> t.getProcessName() == null ? "" : t.getProcessName().trim())
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        Set<String> existingCodes = existing.stream()
                .map(t -> t.getProcessCode() == null ? "" : t.getProcessCode().trim())
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        List<Map<String, Object>> missingNodes = processNodes.stream()
                .filter(n -> {
                    String name = getStringValue(n, "name", "").trim();
                    String code = getStringValue(n, "processCode",
                            getStringValue(n, "code", "")).trim();
                    boolean nameExists = StringUtils.hasText(name) && existingNames.contains(name);
                    boolean codeExists = StringUtils.hasText(code) && existingCodes.contains(code);
                    return !nameExists && !codeExists;
                })
                .collect(Collectors.toList());

        if (missingNodes.isEmpty()) {
            return Collections.emptyList();
        }

        List<ProductionProcessTracking> toInsert = buildTrackingRecords(
                order, Collections.singletonList(bundle), missingNodes, taskBySizeKey, anyReceivedTask);
        if (!toInsert.isEmpty()) {
            log.info("[工序同步-新增] 菲号#{} 补建 {} 条缺失 tracking 记录：{}",
                    bundle.getBundleNo(), toInsert.size(),
                    toInsert.stream()
                            .map(t -> t.getProcessName() + "/" + t.getProcessCode())
                            .collect(Collectors.joining(", ")));
        }
        return toInsert;
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
                // processCode 优先取 node.processCode / code；禁止用 node.id（前端工艺流程编辑器生成的 UUID）
                String processCode = getStringValue(node, "processCode",
                        getStringValue(node, "code", ""));
                tracking.setProcessCode(StringUtils.hasText(processCode) ? processCode : processName);
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
                // 先收集所有阶段名（name === progressStage 的节点是父节点）
                Set<String> parentStageNames = new HashSet<>();
                for (Map<String, Object> node : nodeList) {
                    String name = getStringValue(node, "name", "");
                    String stage = getStringValue(node, "progressStage", "");
                    if (StringUtils.hasText(name) && name.equals(stage)) {
                        parentStageNames.add(name);
                    }
                }
                Set<String> seenNames = new HashSet<>();
                for (Map<String, Object> node : nodeList) {
                    String progressStage = getStringValue(node, "progressStage", "");
                    if ("采购".equals(progressStage) || "procurement".equals(progressStage)) {
                        continue;
                    }
                    String name = getStringValue(node, "name", "");
                    // 过滤父节点：name === progressStage 且存在其他子节点（progressStage === name）
                    // 父节点是阶段分组（如"尾部"），不是可扫码工序，不应生成跟踪记录
                    if (StringUtils.hasText(name) && name.equals(progressStage)
                            && nodeList.stream().anyMatch(n -> !name.equals(getStringValue(n, "name", ""))
                                    && name.equals(getStringValue(n, "progressStage", "")))) {
                        log.info("订单 {} 跳过父节点「{}」（阶段分组，非可扫码工序）", order.getOrderNo(), name);
                        continue;
                    }
                    if (StringUtils.hasText(name) && !seenNames.add(name)) {
                        log.warn("订单 {} 工序配置中发现重复工序「{}」，已跳过（保留首次出现）", order.getOrderNo(), name);
                        continue;
                    }
                    nodes.add(node);
                }
                log.info("订单 {} 解析工序配置成功：共 {} 个工序（父节点已过滤）", order.getOrderNo(), nodes.size());
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
