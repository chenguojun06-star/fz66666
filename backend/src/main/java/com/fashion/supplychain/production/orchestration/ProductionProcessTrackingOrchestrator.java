package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.exception.BusinessException;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 生产工序跟踪编排器
 *
 * 核心功能：
 * 1. 裁剪完成时，自动生成 菲号×工序 的跟踪记录（工资结算依据）
 * 2. 扫码时，更新跟踪记录状态（防重复扫码）
 * 3. 管理员可重置记录（允许重新扫码）
 */
@Slf4j
@Service
public class ProductionProcessTrackingOrchestrator {

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
     *
     * 生成逻辑：菲号 × 工序 = N条记录
     * 例：5个菲号 × 3个工序 = 15条记录
     *
     * @param productionOrderId 生产订单ID（String类型）
     * @return 生成的记录数量
     */
    @Transactional(rollbackFor = Exception.class)
    public int initializeProcessTracking(String productionOrderId) {
        log.info("开始初始化工序跟踪记录，订单ID: {}", productionOrderId);

        // 1. 查询订单信息
        ProductionOrder order = productionOrderService.getById(productionOrderId);
        if (order == null) {
            throw new BusinessException("订单不存在：" + productionOrderId);
        }

        // 2. 查询该订单的所有菲号（裁剪单）
        List<CuttingBundle> bundles = cuttingBundleService.lambdaQuery()
                .eq(CuttingBundle::getProductionOrderId, productionOrderId)
                .list();
        if (CollectionUtils.isEmpty(bundles)) {
            log.warn("订单 {} 没有裁剪单，跳过初始化", order.getOrderNo());
            return 0;
        }

        // 3. 读取订单的工序配置（progressWorkflowJson 字段）
        List<Map<String, Object>> processNodes = parseProcessNodes(order);
        if (CollectionUtils.isEmpty(processNodes)) {
            log.warn("订单 {} 没有配置工序节点，跳过初始化", order.getOrderNo());
            return 0;
        }

        // 3.1 确保裁剪节点在工序列表中（裁剪是第一道工序，自动完成）
        boolean hasCuttingNode = processNodes.stream()
                .anyMatch(n -> "裁剪".equals(getStringValue(n, "name", ""))
                        || "裁剪".equals(getStringValue(n, "progressStage", "")));
        BigDecimal cuttingUnitPrice = BigDecimal.ZERO;
        if (!hasCuttingNode) {
            // 从模板库获取裁剪单价
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
            cuttingNode.put("_isCuttingAutoNode", true); // 标记为自动添加的裁剪节点
            processNodes.add(0, cuttingNode);
            log.info("订单 {} 自动添加裁剪节点到工序跟踪（单价={}）", order.getOrderNo(), cuttingUnitPrice);
        }

        // ✅ 删除该订单的老记录（允许重新初始化，避免重复）
        int deletedCount = trackingService.deleteByOrderId(productionOrderId);
        if (deletedCount > 0) {
            log.info("订单 {} 删除老的跟踪记录 {} 条", order.getOrderNo(), deletedCount);
        }

        // 4. 查询该订单的所有裁剪任务，按 color+size 建索引（精确匹配当前菲号对应的任务）
        Map<String, CuttingTask> taskBySizeKey = new HashMap<>();
        CuttingTask anyReceivedTask = null; // 兜底：任意一个已领取任务
        try {
            List<CuttingTask> allTasks = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getProductionOrderId, productionOrderId)
                .list();
            for (CuttingTask t : allTasks) {
                String key = (t.getColor() == null ? "" : t.getColor().trim())
                    + "|" + (t.getSize() == null ? "" : t.getSize().trim());
                // 优先保留已领取（receiverName不为空）的任务
                if (!taskBySizeKey.containsKey(key)
                        || StringUtils.hasText(t.getReceiverName())) {
                    taskBySizeKey.put(key, t);
                }
                if (StringUtils.hasText(t.getReceiverName()) && anyReceivedTask == null) {
                    anyReceivedTask = t;
                }
            }
        } catch (Exception e) {
            log.warn("查询裁剪任务失败: orderId={}", productionOrderId, e);
        }

        // 5. 生成 菲号 × 工序 的跟踪记录
        List<ProductionProcessTracking> trackingRecords = new ArrayList<>();
        String currentUser = UserContext.username() != null ? UserContext.username() : "system";

        for (CuttingBundle bundle : bundles) {
            // 按 color+size 查找对应裁剪任务，找不到则用任意已领取任务兜底
            String bundleKey = (bundle.getColor() == null ? "" : bundle.getColor().trim())
                + "|" + (bundle.getSize() == null ? "" : bundle.getSize().trim());
            CuttingTask matchedTask = taskBySizeKey.getOrDefault(bundleKey, anyReceivedTask);

            for (int i = 0; i < processNodes.size(); i++) {
                Map<String, Object> node = processNodes.get(i);

                ProductionProcessTracking tracking = new ProductionProcessTracking();

                // 主键ID（手动生成UUID）
                tracking.setId(java.util.UUID.randomUUID().toString().replace("-", ""));

                // 订单信息
                tracking.setProductionOrderId(order.getId());
                tracking.setProductionOrderNo(order.getOrderNo());

                // 菲号信息
                tracking.setCuttingBundleId(bundle.getId());
                tracking.setBundleNo(bundle.getBundleNo());
                // 拼接SKU：styleNo-color-size
                String sku = bundle.getStyleNo() + "-" + bundle.getColor() + "-" + bundle.getSize();
                tracking.setSku(sku);
                tracking.setColor(bundle.getColor());
                tracking.setSize(bundle.getSize());
                tracking.setQuantity(bundle.getQuantity());

                // 工序信息 - 使用name作为process_code，与小程序扫码的progressStage一致
                String processName = getStringValue(node, "name", "工序" + (i + 1));
                tracking.setProcessCode(processName);
                tracking.setProcessName(processName);
                tracking.setProcessOrder(i + 1);
                tracking.setUnitPrice(getBigDecimalValue(node, "unitPrice", BigDecimal.ZERO));

                // ✅ 裁剪工序：直接用与该菲号color+size匹配的裁剪任务的领取人和完成时间
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
                    // 计算裁剪结算金额
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

                trackingRecords.add(tracking);
            }
        }

        // 6. 批量插入
        int count = trackingService.batchInsert(trackingRecords);
        log.info("订单 {} 初始化完成：{} 个菲号 × {} 个工序 = {} 条跟踪记录",
                order.getOrderNo(), bundles.size(), processNodes.size(), count);

        return count;
    }

    /**
     * 更新扫码记录（扫码时调用）
     *
     * 防重复逻辑：菲号+工序唯一（数据库 UNIQUE KEY）
     *
     * @param cuttingBundleId 菲号ID（String类型）
     * @param processCode 工序编号
     * @param operatorId 操作人ID（String类型）
     * @param operatorName 操作人姓名
     * @param scanRecordId 扫码记录ID（关联 t_scan_record，String类型）
     * @return 更新成功返回true，记录不存在或已扫码返回false
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean updateScanRecord(String cuttingBundleId, String processCode,
                                   String operatorId, String operatorName, String scanRecordId) {

        // 1. 查询跟踪记录（先按processCode精确匹配，再按processName回退匹配）
        ProductionProcessTracking tracking = trackingService.getByBundleAndProcess(cuttingBundleId, processCode);

        if (tracking == null) {
            // 回退：用processCode作为processName查询（兼容旧数据中processCode≠processName的情况）
            tracking = trackingService.getByBundleAndProcessName(cuttingBundleId, processCode);
            if (tracking != null) {
                log.info("通过processName回退匹配成功：菲号ID={}, processCode={} → processName={}",
                        cuttingBundleId, processCode, tracking.getProcessName());
                // 同步修正processCode为processName，避免下次再回退
                tracking.setProcessCode(processCode);
            }
        }

        if (tracking == null) {
            log.warn("未找到跟踪记录：菲号ID={}, 工序={}", cuttingBundleId, processCode);
            return false;
        }

        // 2. 检查是否已扫码（防重复）
        if ("scanned".equals(tracking.getScanStatus())) {
            throw new BusinessException(String.format(
                "该菲号「%s」工序已被「%s」领取，不能重复扫码",
                tracking.getProcessName(),
                tracking.getOperatorName()
            ));
        }

        // 3. 更新扫码状态
        tracking.setScanStatus("scanned");
        tracking.setScanTime(LocalDateTime.now());
        tracking.setScanRecordId(scanRecordId);
        tracking.setOperatorId(operatorId);
        tracking.setOperatorName(operatorName);

        // 4. 计算结算金额
        if (tracking.getUnitPrice() != null && tracking.getQuantity() != null) {
            BigDecimal amount = tracking.getUnitPrice().multiply(new BigDecimal(tracking.getQuantity()));
            tracking.setSettlementAmount(amount);
        }

        tracking.setUpdater(UserContext.username() != null ? UserContext.username() : "system");

        boolean success = trackingService.updateById(tracking);

        log.info("工序跟踪记录更新：菲号={}, 工序={}, 操作人={}, 金额={}",
                tracking.getBundleNo(), tracking.getProcessName(), operatorName, tracking.getSettlementAmount());

        return success;
    }

    /**
     * 强制更新裁剪工序的扫码记录（用于裁剪完成时覆盖初始化的默认值）
     * 与updateScanRecord不同，此方法跳过防重复检查，强制更新裁剪操作人和时间
     *
     * @param cuttingBundleId 菲号ID
     * @param operatorId 操作人ID
     * @param operatorName 操作人姓名
     * @param scanRecordId 扫码记录ID
     * @return 更新成功返回true
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean forcedUpdateCuttingScan(String cuttingBundleId, String operatorId,
                                          String operatorName, String scanRecordId) {
        // 查询裁剪工序的跟踪记录
        ProductionProcessTracking tracking = trackingService.getByBundleAndProcess(cuttingBundleId, "裁剪");

        if (tracking == null) {
            // 回退：用processName查询
            tracking = trackingService.getByBundleAndProcessName(cuttingBundleId, "裁剪");
        }

        if (tracking == null) {
            log.warn("未找到裁剪工序跟踪记录：菲号ID={}", cuttingBundleId);
            return false;
        }

        // 强制更新（不检查scanStatus）
        tracking.setScanStatus("scanned");
        tracking.setScanTime(LocalDateTime.now());
        tracking.setScanRecordId(scanRecordId);
        tracking.setOperatorId(operatorId);
        tracking.setOperatorName(operatorName);

        // 计算结算金额
        if (tracking.getUnitPrice() != null && tracking.getQuantity() != null) {
            BigDecimal amount = tracking.getUnitPrice().multiply(new BigDecimal(tracking.getQuantity()));
            tracking.setSettlementAmount(amount);
        }

        tracking.setUpdater(UserContext.username() != null ? UserContext.username() : operatorName);

        boolean success = trackingService.updateById(tracking);

        log.info("裁剪工序跟踪强制更新：菲号={}, 操作人={}, 金额={}",
                tracking.getBundleNo(), operatorName, tracking.getSettlementAmount());

        return success;
    }

    /**
     * 管理员重置扫码记录（允许重新扫码）
     *
     * @param trackingId 跟踪记录ID
     * @param resetReason 重置原因
     * @return 重置成功返回true
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean resetScanRecord(String trackingId, String resetReason) {
        ProductionProcessTracking tracking = trackingService.getById(trackingId);

        if (tracking == null) {
            throw new BusinessException("跟踪记录不存在：" + trackingId);
        }

        if (tracking.getIsSettled()) {
            throw new BusinessException("该记录已结算，不能重置");
        }

        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL（updateById 默认跳过 null 字段）
        LambdaUpdateWrapper<ProductionProcessTracking> resetUw = new LambdaUpdateWrapper<>();
        resetUw.eq(ProductionProcessTracking::getId, tracking.getId())
               .set(ProductionProcessTracking::getScanStatus, "reset")
               .set(ProductionProcessTracking::getScanTime, null)
               .set(ProductionProcessTracking::getScanRecordId, null)
               .set(ProductionProcessTracking::getOperatorId, null)
               .set(ProductionProcessTracking::getOperatorName, null)
               .set(ProductionProcessTracking::getSettlementAmount, null)
               .set(ProductionProcessTracking::getUpdater,
                       UserContext.username() != null ? UserContext.username() : "system");

        boolean success = trackingService.update(resetUw);

        log.info("管理员重置扫码记录：ID={}, 菲号={}, 工序={}, 原操作人={}, 原因={}",
                trackingId, tracking.getBundleNo(), tracking.getProcessName(),
                tracking.getOperatorName(), resetReason);

        return success;
    }

    /**
     * 查询订单的工序跟踪记录（PC端弹窗显示）
     * 返回前自动使用模板库最新单价覆盖旧的快照价格
     *
     * @param productionOrderId 订单ID（String类型）
     * @return 跟踪记录列表（单价已用模板最新值覆盖）
     */
    public List<ProductionProcessTracking> getTrackingRecords(String productionOrderId) {
        List<ProductionProcessTracking> records = trackingService.getByOrderId(productionOrderId);
        if (CollectionUtils.isEmpty(records)) {
            return records;
        }

        // 查询订单的款号，从模板库获取最新单价覆盖
        ProductionOrder order = productionOrderService.getById(productionOrderId);
        if (order == null || !StringUtils.hasText(order.getStyleNo())) {
            return records;
        }

        try {
            List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
            if (templateNodes == null || templateNodes.isEmpty()) {
                return records;
            }

            Map<String, BigDecimal> priceMap = new HashMap<>();
            for (Map<String, Object> tn : templateNodes) {
                String name = getStringValue(tn, "name", "").trim();
                BigDecimal price = getBigDecimalValue(tn, "unitPrice", BigDecimal.ZERO);
                if (!name.isEmpty()) {
                    priceMap.put(name, price);
                }
            }

            if (priceMap.isEmpty()) {
                return records;
            }

            // 用模板最新价格覆盖记录中的旧价格（仅在内存中覆盖，不写DB）
            for (ProductionProcessTracking tracking : records) {
                BigDecimal templatePrice = priceMap.get(tracking.getProcessName());
                if (templatePrice == null) {
                    templatePrice = priceMap.get(tracking.getProcessCode());
                }
                if (templatePrice != null) {
                    tracking.setUnitPrice(templatePrice);
                    // 重新计算结算金额
                    if (tracking.getQuantity() != null) {
                        tracking.setSettlementAmount(templatePrice.multiply(new BigDecimal(tracking.getQuantity())));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("获取模板价格失败，使用DB中存储的价格 orderNo={}: {}", order.getOrderNo(), e.getMessage());
        }

        return records;
    }

    /**
     * 同步工序单价到跟踪记录（工序配置变更时调用）
     *
     * 场景：用户在"工序详情"中修改了单价后，同步更新到工序跟踪表
     * 匹配逻辑：通过 processName 或 processCode 关联（兼容新旧数据）
     * 价格来源：模板库最新价格（优先）→ progressWorkflowJson快照（备用）
     *
     * @param productionOrderId 生产订单ID
     * @return 更新的记录数量
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncUnitPrices(String productionOrderId) {
        log.info("开始同步工序单价，订单ID: {}", productionOrderId);

        // 1. 查询订单最新数据
        ProductionOrder order = productionOrderService.getById(productionOrderId);
        if (order == null) {
            log.warn("同步单价失败：订单不存在 {}", productionOrderId);
            return 0;
        }

        // 2. 优先从模板库获取最新单价（最权威的价格来源）
        Map<String, BigDecimal> priceMap = new HashMap<>();
        String styleNo = order.getStyleNo();
        if (StringUtils.hasText(styleNo)) {
            try {
                List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo.trim());
                if (templateNodes != null) {
                    for (Map<String, Object> tn : templateNodes) {
                        String name = getStringValue(tn, "name", "").trim();
                        BigDecimal price = getBigDecimalValue(tn, "unitPrice", BigDecimal.ZERO);
                        if (!name.isEmpty()) {
                            priceMap.put(name, price);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("从模板库获取价格失败 styleNo={}: {}", styleNo, e.getMessage());
            }
        }

        // 3. 如果模板库没有数据，回退到 progressWorkflowJson
        if (priceMap.isEmpty()) {
            List<Map<String, Object>> processNodes = parseProcessNodes(order);
            if (CollectionUtils.isEmpty(processNodes)) {
                log.warn("订单 {} 没有工序节点配置，跳过单价同步", order.getOrderNo());
                return 0;
            }
            for (Map<String, Object> node : processNodes) {
                String name = getStringValue(node, "name", "").trim();
                BigDecimal unitPrice = getBigDecimalValue(node, "unitPrice", BigDecimal.ZERO);
                if (!name.isEmpty()) {
                    priceMap.put(name, unitPrice);
                }
            }
        }

        if (priceMap.isEmpty()) {
            log.warn("订单 {} 无可用的工序价格数据", order.getOrderNo());
            return 0;
        }

        // 4. 查询该订单所有跟踪记录
        List<ProductionProcessTracking> trackingRecords = trackingService.getByOrderId(productionOrderId);
        if (CollectionUtils.isEmpty(trackingRecords)) {
            log.info("订单 {} 没有跟踪记录，跳过单价同步", order.getOrderNo());
            return 0;
        }

        // 5. 逐条更新单价（兼容 processCode 为名称或编号的两种情况）
        int updatedCount = 0;
        for (ProductionProcessTracking tracking : trackingRecords) {
            // 优先用 processName 匹配，其次用 processCode 匹配
            BigDecimal newPrice = priceMap.get(tracking.getProcessName());
            if (newPrice == null) {
                newPrice = priceMap.get(tracking.getProcessCode());
            }
            if (newPrice == null) {
                continue;
            }

            BigDecimal oldPrice = tracking.getUnitPrice();
            if (oldPrice != null && oldPrice.compareTo(newPrice) == 0) {
                continue;
            }

            tracking.setUnitPrice(newPrice);

            // 已扫码的记录需要重新计算结算金额
            // ⚠️ 已结算记录（is_settled=true）跳过 settlementAmount 更新，避免覆盖已审批的工资数据
            if ("scanned".equals(tracking.getScanStatus()) && tracking.getQuantity() != null) {
                if (Boolean.TRUE.equals(tracking.getIsSettled())) {
                    log.warn("跳过已结算记录的结算金额更新: trackingId={}, orderId={}, processCode={}, settledBatchNo={}",
                            tracking.getId(), productionOrderId, tracking.getProcessCode(), tracking.getSettledBatchNo());
                } else {
                    BigDecimal settlementAmount = newPrice.multiply(new BigDecimal(tracking.getQuantity()));
                    tracking.setSettlementAmount(settlementAmount);
                }
            }

            tracking.setUpdater(UserContext.username() != null ? UserContext.username() : "system");
            trackingService.updateById(tracking);
            updatedCount++;
        }

        log.info("订单 {} 单价同步完成：共 {} 条记录，更新 {} 条",
                order.getOrderNo(), trackingRecords.size(), updatedCount);

        return updatedCount;
    }

    /**
     * 批量同步所有订单的工序跟踪单价（管理员维护用）
     * 从模板库读取最新价格，更新到 t_production_process_tracking 表
     *
     * @return 更新结果摘要
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> syncAllOrderTrackingPrices() {
        log.warn("开始批量同步所有订单工序跟踪单价（管理员维护操作）");

        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ne(ProductionOrder::getStatus, "completed")
                .isNotNull(ProductionOrder::getStyleNo)
                .list();

        int totalOrders = 0;
        int updatedOrders = 0;
        int totalRecordsUpdated = 0;
        int errorCount = 0;

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

    // ========== 私有辅助方法 ==========

    /**
     * 解析订单的工序节点配置
     *
     * @param order 生产订单
     * @return 工序节点列表
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseProcessNodes(ProductionOrder order) {
        String workflowJson = order.getProgressWorkflowJson();
        List<Map<String, Object>> nodes = new ArrayList<>();

        if (workflowJson == null || workflowJson.trim().isEmpty()) {
            log.warn("订单 {} 没有工艺流程配置 (progressWorkflowJson 为空)，尝试从模板库兜底", order.getOrderNo());
            // ★ 兜底：progressWorkflowJson 为空时，从模板库读取工序节点（历史订单场景）
            if (StringUtils.hasText(order.getStyleNo())) {
                try {
                    List<Map<String, Object>> templateNodes =
                            templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
                    if (templateNodes != null && !templateNodes.isEmpty()) {
                        for (Map<String, Object> node : templateNodes) {
                            String stage = getStringValue(node, "progressStage", "");
                            if ("采购".equals(stage) || "procurement".equals(stage)) continue;
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
            // 解析JSON
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> workflow = mapper.readValue(workflowJson, Map.class);

            // 提取 nodes 数组
            Object nodesObj = workflow.get("nodes");
            if (nodesObj instanceof List) {
                List<Map<String, Object>> nodeList = (List<Map<String, Object>>) nodesObj;
                for (Map<String, Object> node : nodeList) {
                    // 过滤掉采购节点（采购不需要工序跟踪）
                    String progressStage = getStringValue(node, "progressStage", "");
                    if ("采购".equals(progressStage) || "procurement".equals(progressStage)) {
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

    private String getStringValue(Map<String, Object> map, String key, String defaultValue) {
        Object value = map.get(key);
        return value != null ? value.toString() : defaultValue;
    }

    private BigDecimal getBigDecimalValue(Map<String, Object> map, String key, BigDecimal defaultValue) {
        Object value = map.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof BigDecimal) {
            return (BigDecimal) value;
        }
        if (value instanceof Number) {
            return new BigDecimal(value.toString());
        }
        try {
            return new BigDecimal(value.toString());
        } catch (Exception e) {
            return defaultValue;
        }
    }

    private static final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 批量刷新所有订单的 progressWorkflowJson 中的工序单价
     * 从模板库读取最新单价，更新到订单的 progressWorkflowJson 字段
     *
     * @return 刷新结果汇总
     */
    public Map<String, Object> refreshWorkflowPrices() {
        log.warn("开始批量刷新订单工序单价（管理员维护操作）");

        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ne(ProductionOrder::getStatus, "completed")
                .isNotNull(ProductionOrder::getProgressWorkflowJson)
                .ne(ProductionOrder::getProgressWorkflowJson, "")
                .isNotNull(ProductionOrder::getStyleNo)
                .list();

        if (orders.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("message", "没有需要刷新的订单");
            return empty;
        }

        int total = orders.size();
        int updatedCount = 0;
        int skipCount = 0;
        int errorCount = 0;
        List<Map<String, Object>> details = new ArrayList<>();

        Map<String, List<Map<String, Object>>> templateCache = new HashMap<>();

        for (ProductionOrder order : orders) {
            try {
                String styleNo = order.getStyleNo().trim();
                if (!StringUtils.hasText(styleNo)) {
                    skipCount++;
                    continue;
                }

                List<Map<String, Object>> templateNodes = templateCache.get(styleNo);
                if (templateNodes == null) {
                    templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo);
                    templateCache.put(styleNo, templateNodes != null ? templateNodes : new ArrayList<>());
                }
                if (templateNodes == null || templateNodes.isEmpty()) {
                    skipCount++;
                    continue;
                }

                Map<String, BigDecimal> priceMap = new HashMap<>();
                for (Map<String, Object> tn : templateNodes) {
                    String name = String.valueOf(tn.getOrDefault("name", "")).trim();
                    Object up = tn.get("unitPrice");
                    BigDecimal price = BigDecimal.ZERO;
                    if (up instanceof BigDecimal) {
                        price = (BigDecimal) up;
                    } else if (up instanceof Number) {
                        price = BigDecimal.valueOf(((Number) up).doubleValue());
                    }
                    if (StringUtils.hasText(name) && price.compareTo(BigDecimal.ZERO) > 0) {
                        priceMap.put(name, price);
                    }
                }
                if (priceMap.isEmpty()) {
                    skipCount++;
                    continue;
                }

                String json = order.getProgressWorkflowJson();
                Map<String, Object> workflow = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> nodes = (List<Map<String, Object>>) workflow.get("nodes");

                if (nodes == null || nodes.isEmpty()) {
                    skipCount++;
                    continue;
                }

                boolean changed = false;
                for (Map<String, Object> node : nodes) {
                    String nodeName = String.valueOf(node.getOrDefault("name", "")).trim();
                    BigDecimal templatePrice = priceMap.get(nodeName);
                    if (templatePrice != null) {
                        Object current = node.get("unitPrice");
                        BigDecimal currentPrice = BigDecimal.ZERO;
                        if (current instanceof Number) {
                            currentPrice = BigDecimal.valueOf(((Number) current).doubleValue());
                        }
                        if (templatePrice.compareTo(currentPrice) != 0) {
                            node.put("unitPrice", templatePrice);
                            changed = true;
                        }
                    }
                }

                if (changed) {
                    String updatedJson = objectMapper.writeValueAsString(workflow);
                    productionOrderService.lambdaUpdate()
                            .eq(ProductionOrder::getId, order.getId())
                            .set(ProductionOrder::getProgressWorkflowJson, updatedJson)
                            .update();
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
}
