package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.UrgeRecord;
import com.fashion.supplychain.intelligence.orchestration.OrderDecisionCaptureOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningOutcomeOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.UrgeRecordService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.helper.OrderListCacheHelper;
import com.fashion.supplychain.production.helper.ProductionOrderLogAppendHelper;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

/**
 * 生产订单编排器（核心 Orchestrator）
 *
 * 职责：
 * - 订单查询（queryPage / getDetailById / getDetailByOrderNo / getGlobalStats）
 * - 订单创建/编辑 → 委托 {@link ProductionOrderCreationHelper}
 * - 订单生命周期（删除/报废）→ 委托 {@link ProductionOrderLifecycleHelper}
 * - 工序/工作流（锁定/回滚/采购确认/委派）→ 委托 {@link ProductionOrderWorkflowHelper}
 * - 进度/财务编排 → 委托 progressOrchestrationService / financeOrchestrationService
 * - 订单流程可视化 → 委托 flowOrchestrationService
 */
@Service
@Slf4j
public class ProductionOrderOrchestrator {

    public static final String CLOSE_SOURCE_MY_ORDERS = "myOrders";
    public static final String CLOSE_SOURCE_PRODUCTION_PROGRESS = "productionProgress";

    // ---------- 服务依赖 ----------

    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;

    @Autowired
    private ProductionOrderProgressOrchestrationService progressOrchestrationService;

    @Autowired
    private ProductionOrderFinanceOrchestrationService financeOrchestrationService;

    @Autowired
    private ProductionOrderFlowOrchestrationService flowOrchestrationService;

    @Autowired
    private ProductionOrderOrchestratorHelper helper;

    @Autowired(required = false)
    private OperationLogService operationLogService;

    @Autowired(required = false)
    private OrderDecisionCaptureOrchestrator orderDecisionCaptureOrchestrator;

    @Autowired(required = false)
    private OrderLearningOutcomeOrchestrator orderLearningOutcomeOrchestrator;

    @Autowired(required = false)
    private com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService ecOrderService;

    @Autowired
    private com.fashion.supplychain.production.service.ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private UrgeRecordService urgeRecordService;

    @Autowired
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.mapper.CollaborationTaskMapper collaborationTaskMapper;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    // ---------- updateBasicInfo 相关常量 ----------

    private static final java.util.Set<String> BASIC_INFO_EDITABLE_FIELDS = java.util.Set.of(
            "styleNo", "styleName", "skc", "color", "size", "sku", "orderLines", "skuAutoGenerate");

    private static final java.util.Map<String, String> FIELD_TO_COLUMN = java.util.Map.of(
            "styleNo", "style_no",
            "styleName", "style_name",
            "skc", "skc",
            "color", "color",
            "size", "size",
            "sku", "sku",
            "orderLines", "order_details",
            "skuAutoGenerate", "sku_auto_generate");

    private static final java.util.List<String[]> STYLE_NO_DOWNSTREAM_TABLES = java.util.List.of(
            new String[]{"t_cutting_bundle", "order_id"},
            new String[]{"t_cutting_task", "order_id"},
            new String[]{"t_material_purchase", "order_no"},
            new String[]{"t_scan_record", "order_id"},
            new String[]{"t_product_warehousing", "order_id"},
            new String[]{"t_product_outstock", "order_id"},
            new String[]{"t_cutting_bom", "order_id"},
            new String[]{"t_factory_shipment", "order_no"},
            new String[]{"t_material_picking", "order_id"});

    private static final java.util.List<String[]> COLOR_DOWNSTREAM_TABLES = java.util.List.of(
            new String[]{"t_cutting_bundle", "order_id"},
            new String[]{"t_cutting_task", "order_id"});

    private static final java.util.List<String[]> SKU_DOWNSTREAM_TABLES = java.util.List.of(
            new String[]{"t_cutting_bundle", "order_id"},
            new String[]{"t_cutting_task", "order_id"},
            new String[]{"t_scan_record", "order_id"},
            new String[]{"t_product_warehousing", "order_id"});

    private static final java.util.List<String[]> SIZE_DOWNSTREAM_TABLES = java.util.List.of(
            new String[]{"t_cutting_bundle", "order_id"},
            new String[]{"t_cutting_task", "order_id"},
            new String[]{"t_scan_record", "order_id"});

    // ---------- Helper 依赖 ----------

    @Autowired
    private ProductionOrderLifecycleHelper lifecycleHelper;

    @Autowired
    private ProductionOrderWorkflowHelper workflowHelper;

    @Autowired
    private ProductionOrderCreationHelper creationHelper;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    @Autowired
    private OrderListCacheHelper orderListCacheHelper;

    @Autowired
    private ProductionOrderLogAppendHelper logAppendHelper;

    // ======================= 查询类方法 =======================

    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        String cacheKey = orderListCacheHelper.buildListCacheKey(params);
        IPage<?> cached = orderListCacheHelper.getListCache(cacheKey);
        if (cached != null) {
            @SuppressWarnings("unchecked")
            IPage<ProductionOrder> typed = (IPage<ProductionOrder>) cached;
            return typed;
        }

        IPage<ProductionOrder> page = productionOrderQueryService.queryPage(params);
        enrichEcAndDefect(page);

        orderListCacheHelper.putListCache(cacheKey, page);
        return page;
    }

    private void enrichEcAndDefect(IPage<ProductionOrder> page) {
        if (page == null || page.getRecords().isEmpty()) return;
        enrichEcOrders(page);
        enrichDefectQuantity(page);
    }

    private void enrichEcOrders(IPage<ProductionOrder> page) {
        if (ecOrderService == null) return;
        try {
            List<String> orderNos = page.getRecords().stream()
                    .map(ProductionOrder::getOrderNo)
                    .filter(StringUtils::hasText)
                    .distinct()
                    .collect(java.util.stream.Collectors.toList());
            if (orderNos.isEmpty()) return;
            List<com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder> ecOrders =
                    ecOrderService.list(
                            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<
                                    com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder>()
                                    .in(com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder::getProductionOrderNo, orderNos)
                                    .eq(com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder::getTenantId, UserContext.tenantId())
                            );
            if (ecOrders.isEmpty()) return;
            Map<String, com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder> ecMap =
                    ecOrders.stream().collect(java.util.stream.Collectors.toMap(
                            com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder::getProductionOrderNo,
                            o -> o,
                            (a, b) -> a
                    ));
            // 仅在内存中补充 ecOrderNo/ecPlatform/platformCode，不在此处执行 UPDATE（读方法不应有副作用）
            // platformCode 的持久化由订单创建/关联时（linkProductionOrder/receiveOrder）负责
            page.getRecords().forEach(o -> {
                com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder ec =
                        ecMap.get(o.getOrderNo());
                if (ec != null) {
                    o.setEcOrderNo(ec.getOrderNo());
                    o.setEcPlatform(ec.getPlatform());
                    if (!StringUtils.hasText(o.getPlatformCode()) && StringUtils.hasText(ec.getPlatform())) {
                        o.setPlatformCode(ec.getPlatform());
                    }
                }
            });
        } catch (Exception e) {
            log.warn("[EC关联] 批量关联EC单号失败，不影响主流程: {}", e.getMessage());
        }
    }

    private void enrichDefectQuantity(IPage<ProductionOrder> page) {
        try {
            List<String> orderIds = page.getRecords().stream()
                    .map(ProductionOrder::getId)
                    .filter(id -> id != null && !id.isEmpty())
                    .distinct()
                    .collect(java.util.stream.Collectors.toList());
            if (orderIds.isEmpty()) return;
            List<com.fashion.supplychain.production.entity.ProductWarehousing> defectRecords =
                    productWarehousingService.list(
                            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<
                                    com.fashion.supplychain.production.entity.ProductWarehousing>()
                                    .select(com.fashion.supplychain.production.entity.ProductWarehousing::getOrderId,
                                            com.fashion.supplychain.production.entity.ProductWarehousing::getUnqualifiedQuantity)
                                    .in(com.fashion.supplychain.production.entity.ProductWarehousing::getOrderId, orderIds)
                                    .eq(com.fashion.supplychain.production.entity.ProductWarehousing::getTenantId, UserContext.tenantId())
                                    .gt(com.fashion.supplychain.production.entity.ProductWarehousing::getUnqualifiedQuantity, 0)
                                    .eq(com.fashion.supplychain.production.entity.ProductWarehousing::getDeleteFlag, 0)
                            );
            if (defectRecords.isEmpty()) return;
            Map<String, Integer> defectSumMap = defectRecords.stream()
                    .collect(java.util.stream.Collectors.toMap(
                            com.fashion.supplychain.production.entity.ProductWarehousing::getOrderId,
                            w -> w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity(),
                            Integer::sum
                    ));
            page.getRecords().forEach(o -> {
                Integer defectSum = defectSumMap.get(o.getId());
                if (defectSum != null) {
                    o.setUnqualifiedQuantity(defectSum);
                }
            });
        } catch (Exception e) {
            log.warn("[次品数量] 批量填充次品数量失败，不影响主流程: {}", e.getMessage());
        }
    }

    /**
     * 获取全局订单统计数据（用于顶部统计卡片）
     * 返回符合筛选条件的订单统计，支持按工厂、关键词、状态筛选
     *
     * @param params 查询参数（keyword, status, factoryName等）
     * @return 统计数据DTO
     */
    public com.fashion.supplychain.production.dto.ProductionOrderStatsDTO getGlobalStats(java.util.Map<String, Object> params) {
        return productionOrderQueryService.getGlobalStats(params);
    }

    public ProductionOrder getDetailById(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder order = productionOrderQueryService.getDetailById(oid);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        return order;
    }

    public ProductionOrder getDetailByOrderNo(String orderNo) {
        // 委托给QueryService，它会调用fillFlowStageFields填充二次工艺等所有进度数据
        ProductionOrder order = productionOrderQueryService.getDetailByOrderNo(orderNo);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }

        // 仅处理SKU生成逻辑
        if (StringUtils.hasText(order.getOrderDetails())) {
            try {
                List<Map<String, Object>> items = helper.resolveOrderLines(order.getOrderDetails());
                if (items != null && !items.isEmpty()) {
                    String styleNo = StringUtils.hasText(order.getStyleNo()) ? order.getStyleNo().trim() : "";
                    String orderNoFinal = StringUtils.hasText(order.getOrderNo()) ? order.getOrderNo().trim() : "";
                    boolean autoGenerate = Boolean.TRUE.equals(order.getSkuAutoGenerate());
                    for (Map<String, Object> item : items) {
                        if (item == null || item.isEmpty()) {
                            continue;
                        }
                        String color = item.get("color") == null ? null : String.valueOf(item.get("color")).trim();
                        String size = item.get("size") == null ? null : String.valueOf(item.get("size")).trim();
                        if (!StringUtils.hasText(color) || !StringUtils.hasText(size)) {
                            continue;
                        }
                        // 检查是否已经有用户自定义的 skuNo
                        String existingSkuNo = item.get("skuNo") != null ? String.valueOf(item.get("skuNo")).trim() : null;
                        if (autoGenerate || !StringUtils.hasText(existingSkuNo)) {
                            // 只有当开启自动生成或者用户还没有填写时才自动生成
                            String skuNo = helper.buildSkuNo(orderNoFinal, styleNo, color, size);
                            item.put("skuNo", skuNo);
                            item.put("skuKey", skuNo);
                        } else {
                            // 用户已自定义，保留用户的值，只设置 skuKey
                            item.put("skuKey", existingSkuNo);
                        }
                    }
                }
                order.setItems(items);
            } catch (Exception e) {
                log.warn("解析订单明细失败: {}", e.getMessage());
            }
        }

        return order;
    }

    // ======================= 创建/编辑 → CreationHelper =======================

    @Transactional(rollbackFor = Exception.class)
    public boolean saveOrUpdateOrder(ProductionOrder productionOrder) {
        boolean isNew = productionOrder.getId() == null;
        boolean result = creationHelper.saveOrUpdateOrder(productionOrder);
        if (result) {
            if (isNew) {
                logAppendHelper.appendCreate(productionOrder.getId());
            } else {
                logAppendHelper.appendUpdate(productionOrder.getId(), "基础信息");
            }
        }
        evictCacheAfterCommit(productionOrder.getId());
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createOrderFromStyle(String styleId, String priceType, String remark) {
        Map<String, Object> result = creationHelper.createOrderFromStyle(styleId, priceType, remark);
        evictTenantListCacheAfterCommit();
        return result;
    }

    // ======================= 生命周期 → LifecycleHelper =======================

    @Transactional(rollbackFor = Exception.class)
    public boolean deleteById(String id) {
        boolean result = lifecycleHelper.deleteById(id);
        evictCacheAfterCommit(id);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> deleteByIdWithApproval(String id, String reason) {
        Map<String, Object> result = lifecycleHelper.deleteByIdWithApproval(id, reason);
        evictCacheAfterCommit(id);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean scrapOrder(String id, String remark) {
        assertOrderBelongsToCurrentTenant(id, "报废订单");
        boolean result;
        if (distributedLockService == null) {
            result = lifecycleHelper.scrapOrder(id, remark);
        } else {
            result = distributedLockService.executeWithLock("order:scrap:" + id, 10, java.util.concurrent.TimeUnit.SECONDS,
                    () -> lifecycleHelper.scrapOrder(id, remark));
        }
        evictCacheAfterCommit(id);
        return result;
    }

    // ======================= 工序/工作流 → WorkflowHelper =======================

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder lockProgressWorkflow(String id, String workflowJson) {
        ProductionOrder result = workflowHelper.lockProgressWorkflow(id, workflowJson);
        evictCacheAfterCommit(id);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder rollbackProgressWorkflow(String id, String reason) {
        ProductionOrder result = workflowHelper.rollbackProgressWorkflow(id, reason);
        evictCacheAfterCommit(id);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder confirmProcurement(String orderId, String remark) {
        ProductionOrder result = workflowHelper.confirmProcurement(orderId, remark);
        evictCacheAfterCommit(orderId);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delegateProcess(String orderId, String processNode, String factoryId, Double unitPrice) {
        assertOrderBelongsToCurrentTenant(orderId, "工序委派");
        workflowHelper.delegateProcess(orderId, processNode, factoryId, unitPrice);
        evictCacheAfterCommit(orderId);
    }

    // ======================= 进度/财务编排 =======================

    public int recomputeProgressByStyleNo(String styleNo) {
        return progressOrchestrationService.recomputeProgressByStyleNo(styleNo);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateProductionProgress(String id, Integer progress, String rollbackRemark,
            String rollbackToProcessName) {
        boolean result = progressOrchestrationService.updateProductionProgress(id, progress, rollbackRemark,
                rollbackToProcessName);
        if (result) {
            logAppendHelper.appendUpdateProgress(id, progress);
        }
        evictCacheAfterCommit(id);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateMaterialArrivalRate(String id, Integer rate) {
        boolean result = progressOrchestrationService.updateMaterialArrivalRate(id, rate);
        if (result) {
            logAppendHelper.appendUpdateMaterialArrival(id, rate);
        }
        evictCacheAfterCommit(id);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        assertOrderBelongsToCurrentTenant(id, "完成生产");
        boolean result = financeOrchestrationService.completeProduction(id, tolerancePercent);
        if (result) {
            logAppendHelper.appendComplete(id);
        }
        evictCacheAfterCommit(id);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, String sourceModule) {
        return closeOrder(id, sourceModule, null, false);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, String sourceModule, String remark) {
        return closeOrder(id, sourceModule, remark, false);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, String sourceModule, String remark, boolean specialClose) {
        TenantAssert.assertTenantContext();
        assertOrderBelongsToCurrentTenant(id, "关闭订单");
        String src = StringUtils.hasText(sourceModule) ? sourceModule.trim() : null;
        if (!StringUtils.hasText(src)) {
            throw new AccessDeniedException("仅允许在指定模块完成");
        }
        if (!CLOSE_SOURCE_MY_ORDERS.equals(src) && !CLOSE_SOURCE_PRODUCTION_PROGRESS.equals(src)) {
            throw new AccessDeniedException("仅允许在我的订单或工序跟进完成");
        }
        ProductionOrder result;
        if (distributedLockService == null) {
            result = financeOrchestrationService.closeOrder(id, specialClose);
        } else {
            result = distributedLockService.executeWithLock("order:close:" + id, 15, java.util.concurrent.TimeUnit.SECONDS,
                    () -> financeOrchestrationService.closeOrder(id, specialClose));
        }
        try {
            if (operationLogService != null && result != null) {
                OperationLog opLog = new OperationLog();
                opLog.setModule("生产管理");
                opLog.setOperation("关闭订单");
                opLog.setTargetType("生产订单");
                opLog.setTargetId(id);
                opLog.setTargetName(result.getOrderNo());
                opLog.setReason(remark);
                opLog.setOperatorName(UserContext.username());
                try { String uid = UserContext.userId(); if (uid != null) opLog.setOperatorId(Long.parseLong(uid)); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
                opLog.setTenantId(UserContext.tenantId());
                opLog.setOperationTime(LocalDateTime.now());
                opLog.setStatus("success");
                operationLogService.save(opLog);
            }
        } catch (Exception e) {
            log.warn("记录订单关闭操作日志失败: orderId={}", id, e);
        }
        if (result != null) {
            final String orderId = id;
            TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            orderListCacheHelper.evictTenantListCache();
                            orderListCacheHelper.evictDetailCache(orderId);
                        } catch (Exception ex) {
                            log.debug("[OrderCache] 关单后缓存清除失败: orderId={}", orderId);
                        }
                        try {
                            if (orderDecisionCaptureOrchestrator != null) {
                                orderDecisionCaptureOrchestrator.captureByOrderId(result.getId());
                            }
                            if (orderLearningOutcomeOrchestrator != null) {
                                orderLearningOutcomeOrchestrator.refreshByOrderId(result.getId());
                            }
                        } catch (Exception ex) {
                            log.warn("order learning close afterCommit sync failed, orderId={}", result.getId(), ex);
                        }
                    }
                }
            );
        }
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public List<Map<String, Object>> batchCloseOrders(List<String> orderIds, String sourceModule, String remark, boolean specialClose) {
        List<Map<String, Object>> result = financeOrchestrationService.batchCloseOrders(orderIds, sourceModule, remark, specialClose);
        evictTenantListCacheAfterCommit();
        return result;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public boolean ensureFinanceRecordsForOrder(String orderId) {
        return financeOrchestrationService.ensureFinanceRecordsForOrder(orderId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public boolean ensureShipmentReconciliationForOrder(String orderId) {
        return financeOrchestrationService.ensureShipmentReconciliationForOrder(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public int backfillFinanceRecords() {
        return financeOrchestrationService.backfillFinanceRecords();
    }

    public ProductionOrderFlowOrchestrationService.OrderFlowResponse getOrderFlow(String orderId) {
        return flowOrchestrationService.getOrderFlow(orderId);
    }

    // ======================= 催单 =======================

    @Transactional(rollbackFor = Exception.class)
    public UrgeRecord urge(String orderId, String remark) {
        TenantAssert.assertTenantContext();

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "订单");

        if (!StringUtils.hasText(order.getMerchandiser())) {
            throw new IllegalArgumentException("该订单未设置跟单员，无法发送催单通知");
        }

        Long tenantId = UserContext.tenantId();
        String senderUsername = UserContext.username();
        String senderName = sysNoticeOrchestrator.resolveDisplayName(senderUsername, tenantId);

        UrgeRecord record = new UrgeRecord();
        record.setTenantId(tenantId);
        record.setOrderId(orderId);
        record.setOrderNo(order.getOrderNo());
        record.setSenderName(senderName);
        record.setReceiverName(order.getMerchandiser());
        record.setRemark(remark);
        record.setStatus("pending");
        record.setCreatedAt(LocalDateTime.now());
        urgeRecordService.save(record);

        // ★ 使用数据库原子递增，避免 read-modify-write 竞态条件
        // 即使并发催单，计数也不会丢失
        int updated = productionOrderService.getBaseMapper().update(null,
                new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getId, orderId)
                        .set(ProductionOrder::getUrgencyLevel, "urgent")
                        .setSql("urge_count = IFNULL(urge_count, 0) + 1")
                        .set(ProductionOrder::getLastUrgeTime, LocalDateTime.now()));
        if (updated <= 0) {
            log.warn("[催单] 订单原子更新失败，可能已被删除: orderId={}", orderId);
        }

        sysNoticeOrchestrator.sendWithUrgeRecord(order.getOrderNo(), "urge_order", record.getId());

        createUrgeCollaborationTask(order, record, senderName);

        return record;
    }

    private void createUrgeCollaborationTask(ProductionOrder order, UrgeRecord record, String senderName) {
        if (collaborationTaskMapper == null) return;
        try {
            com.fashion.supplychain.intelligence.entity.CollaborationTask task =
                new com.fashion.supplychain.intelligence.entity.CollaborationTask();
            task.setTenantId(order.getTenantId());
            task.setOrderNo(order.getOrderNo());
            task.setStyleNo(order.getStyleNo());
            task.setTargetRole("跟单员");
            task.setInstruction("催单回复：" + order.getOrderNo());
            task.setSourceInstruction(
                (senderName != null ? senderName : "系统") + "发起催单，备注：" +
                (record.getRemark() != null && !record.getRemark().isBlank() ? record.getRemark() : "无") +
                "。请尽快联系工厂确认交期并回复。"
            );
            task.setAcceptanceCriteria("填写预计出货日期和回复备注");
            task.setPriority(com.fashion.supplychain.intelligence.entity.CollaborationTask.Priority.HIGH.name());
            task.setTaskStatus(com.fashion.supplychain.intelligence.entity.CollaborationTask.TaskStatus.ACCEPTED.name());
            task.setSourceType(com.fashion.supplychain.intelligence.entity.CollaborationTask.SourceType.MANUAL.name());
            task.setAssigneeName(order.getMerchandiser());
            task.setCurrentStage("待回复");
            task.setNextStep("联系工厂确认交期，填写预计出货日期和回复备注");
            task.setOverdue(false);
            task.setCreatedAt(LocalDateTime.now());
            task.setUpdatedAt(LocalDateTime.now());
            task.setDueAt(LocalDateTime.now().plusHours(24));
            task.setOrderLinkStatus("LINKED");
            task.setProgressChangeMonitorEnabled(false);
            task.setReminderCount(0);
            collaborationTaskMapper.insert(task);
            log.info("[催单] 已创建待办任务 taskId={} orderNo={} assignee={}",
                task.getId(), order.getOrderNo(), order.getMerchandiser());
        } catch (Exception e) {
            log.warn("[催单] 创建待办任务失败: {}", e.getMessage(), e);
        }
    }

    // ======================= quickEdit / updateBasicInfo / urgeReply =======================

    /**
     * 快速编辑订单（备注、预计出货日期、工序数据、紧急程度、预算工时等）
     *
     * @param payload 前端提交的数据（包含 id / remarks / expectedShipDate /
     *                progressWorkflowJson / urgencyLevel / 各预算工时字段 / sendUrgeNotice 等）
     * @return 更新是否成功
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean quickEdit(Map<String, Object> payload) {
        String id = (String) payload.get("id");
        if (id == null || id.trim().isEmpty()) {
            throw new IllegalArgumentException("缺少id参数");
        }

        ProductionOrder order = productionOrderService.getById(id);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }

        Object clientVersion = payload.get("version");
        if (clientVersion != null) {
            int expected = Integer.parseInt(String.valueOf(clientVersion));
            int actual = order.getVersion() != null ? order.getVersion() : 0;
            if (expected != actual) {
                throw new IllegalArgumentException("订单已被其他人修改，请刷新后重试");
            }
        }

        if (payload.containsKey("remarks")) {
            String remarks = (String) payload.get("remarks");
            order.setRemarks(remarks);
        }

        if (payload.containsKey("expectedShipDate")) {
            String expectedShipDate = (String) payload.get("expectedShipDate");
            if (expectedShipDate != null && !expectedShipDate.isEmpty()) {
                try {
                    order.setExpectedShipDate(LocalDateTime.parse(expectedShipDate,
                            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));
                } catch (Exception e1) {
                    try {
                        order.setExpectedShipDate(java.time.LocalDate.parse(expectedShipDate).atTime(18, 0));
                    } catch (Exception e2) {
                        order.setExpectedShipDate(null);
                    }
                }
            } else {
                order.setExpectedShipDate(null);
            }
        }

        boolean workflowUpdated = false;
        if (payload.containsKey("progressWorkflowJson")) {
            String progressWorkflowJson = (String) payload.get("progressWorkflowJson");
            order.setProgressWorkflowJson(progressWorkflowJson);
            workflowUpdated = true;
        }

        if (payload.containsKey("urgencyLevel")) {
            String urgencyLevel = (String) payload.get("urgencyLevel");
            order.setUrgencyLevel(StringUtils.hasText(urgencyLevel) ? urgencyLevel : "normal");
        }

        String[] budgetHourFields = {
                "procurementBudgetHours", "cuttingBudgetHours", "secondaryProcessBudgetHours",
                "carSewingBudgetHours", "ironingBudgetHours", "packagingBudgetHours",
                "qualityBudgetHours", "warehousingBudgetHours"};
        for (String field : budgetHourFields) {
            if (payload.containsKey(field)) {
                Object val = payload.get(field);
                Integer hours = val != null ? Integer.parseInt(String.valueOf(val)) : null;
                switch (field) {
                    case "procurementBudgetHours" -> order.setProcurementBudgetHours(hours);
                    case "cuttingBudgetHours" -> order.setCuttingBudgetHours(hours);
                    case "secondaryProcessBudgetHours" -> order.setSecondaryProcessBudgetHours(hours);
                    case "carSewingBudgetHours" -> order.setCarSewingBudgetHours(hours);
                    case "ironingBudgetHours" -> order.setIroningBudgetHours(hours);
                    case "packagingBudgetHours" -> order.setPackagingBudgetHours(hours);
                    case "qualityBudgetHours" -> order.setQualityBudgetHours(hours);
                    case "warehousingBudgetHours" -> order.setWarehousingBudgetHours(hours);
                }
            }
        }

        boolean success = productionOrderService.updateById(order);

        if (success && workflowUpdated) {
            try {
                processTrackingOrchestrator.syncUnitPrices(id);
            } catch (Exception e) {
                log.warn("[quickEdit] 同步工序跟踪单价失败: {}", e.getMessage());
            }
        }

        if (success && Boolean.TRUE.equals(payload.get("sendUrgeNotice"))) {
            try {
                sysNoticeOrchestrator.send(order.getOrderNo(), "urge_order");
            } catch (Exception e) {
                log.warn("[quickEdit] 催单通知发送失败: {}", e.getMessage());
            }
        }

        if (success) {
            evictCacheAfterCommit(id);
        }
        return success;
    }

    /**
     * 更新订单基本信息（款号、颜色、尺码、SKU等），并同步到下游关联表
     *
     * @param payload 包含 id / field / value / operationRemark
     * @return 同步的下游记录数
     */
    @Transactional(rollbackFor = Exception.class)
    public int updateBasicInfo(Map<String, Object> payload) {
        String id = (String) payload.get("id");
        String field = (String) payload.get("field");
        String value = (String) payload.get("value");
        String operationRemark = (String) payload.get("operationRemark");

        if (id == null || id.trim().isEmpty()) {
            throw new IllegalArgumentException("缺少id参数");
        }
        if (field == null || !BASIC_INFO_EDITABLE_FIELDS.contains(field)) {
            throw new IllegalArgumentException("不支持编辑的字段: " + field);
        }
        if (value == null) {
            throw new IllegalArgumentException("值不能为空");
        }

        ProductionOrder order = productionOrderService.getById(id);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }

        String terminalStatuses = "closed,scrapped,cancelled,archived";
        if (terminalStatuses.contains(order.getStatus())) {
            throw new IllegalArgumentException("终态订单不允许编辑基本信息");
        }

        String oldValue = getFieldValue(order, field);
        if (value.trim().equals(oldValue != null ? oldValue.trim() : "")) {
            return 0;
        }

        setFieldValue(order, field, value.trim());

        String remark = operationRemark != null ? operationRemark
                : String.format("修改%s：%s → %s", fieldLabel(field), oldValue, value.trim());
        appendRemark(order, remark);

        if (!productionOrderService.updateById(order)) {
            throw new IllegalStateException("更新失败");
        }

        int syncedCount = syncDownstream(order, field, value.trim());

        log.info("[updateBasicInfo] orderId={} field={} old={} new={} synced={}",
                id, field, oldValue, value.trim(), syncedCount);

        evictCacheAfterCommit(id);
        return syncedCount;
    }

    /**
     * 回复催单（更新催单记录回复内容，并在包含回复交期时同步更新订单的预计出货日期）
     *
     * @param payload 包含 urgeRecordId / replyContent / expectedShipDate
     * @return 是否成功
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean urgeReply(Map<String, Object> payload) {
        String urgeRecordId = payload == null ? null : (String) payload.get("urgeRecordId");
        if (!StringUtils.hasText(urgeRecordId)) {
            throw new IllegalArgumentException("缺少urgeRecordId参数");
        }

        UrgeRecord record = urgeRecordService.getById(urgeRecordId);
        if (record == null) {
            throw new IllegalArgumentException("催单记录不存在");
        }

        String replyContent = (String) payload.getOrDefault("replyContent", "");
        String expectedShipDateStr = (String) payload.get("expectedShipDate");

        record.setReplyContent(replyContent);
        record.setReplyTime(LocalDateTime.now());
        record.setStatus("replied");

        if (StringUtils.hasText(expectedShipDateStr)) {
            try {
                record.setReplyExpectedShipDate(java.time.LocalDate.parse(expectedShipDateStr).atTime(18, 0));
            } catch (Exception e) {
                throw new IllegalArgumentException("日期格式错误，请使用yyyy-MM-dd格式");
            }
        }
        urgeRecordService.updateById(record);

        if (record.getReplyExpectedShipDate() != null) {
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getOrderNo, record.getOrderNo())
                    .eq(ProductionOrder::getTenantId, record.getTenantId())
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .one();
            if (order != null) {
                order.setExpectedShipDate(record.getReplyExpectedShipDate());
                productionOrderService.updateById(order);
                evictCacheAfterCommit(order.getId());
            }
        }

        return true;
    }

    // ---------- updateBasicInfo 辅助方法 ----------

    private String getFieldValue(ProductionOrder order, String field) {
        return switch (field) {
            case "styleNo" -> order.getStyleNo();
            case "styleName" -> order.getStyleName();
            case "skc" -> order.getSkc();
            case "color" -> order.getColor();
            case "size" -> order.getSize();
            case "sku" -> order.getSku();
            case "orderLines" -> order.getOrderDetails();
            case "skuAutoGenerate" -> order.getSkuAutoGenerate() != null ? order.getSkuAutoGenerate().toString() : null;
            default -> null;
        };
    }

    private void setFieldValue(ProductionOrder order, String field, String value) {
        switch (field) {
            case "styleNo" -> order.setStyleNo(value);
            case "styleName" -> order.setStyleName(value);
            case "skc" -> order.setSkc(value);
            case "color" -> order.setColor(value);
            case "size" -> order.setSize(value);
            case "sku" -> order.setSku(value);
            case "orderLines" -> order.setOrderDetails(value);
            case "skuAutoGenerate" -> order.setSkuAutoGenerate("true".equalsIgnoreCase(value) || "1".equals(value));
        }
    }

    private String fieldLabel(String field) {
        return java.util.Map.of(
                "styleNo", "款号",
                "styleName", "款名",
                "skc", "SKC",
                "color", "颜色",
                "size", "尺码",
                "sku", "SKU",
                "orderLines", "颜色尺码明细",
                "skuAutoGenerate", "自动生成SKU"
        ).getOrDefault(field, field);
    }

    private void appendRemark(ProductionOrder order, String remark) {
        String existing = order.getRemarks();
        String timestamp = LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        String entry = String.format("[%s] %s", timestamp, remark);
        order.setRemarks(existing != null && !existing.isEmpty() ? existing + "\n" + entry : entry);
    }

    private int syncDownstream(ProductionOrder order, String field, String newValue) {
        String column = FIELD_TO_COLUMN.get(field);
        if (column == null) return 0;

        int total = 0;

        java.util.List<String[]> tables;
        if ("styleNo".equals(field)) {
            tables = STYLE_NO_DOWNSTREAM_TABLES;
        } else if ("color".equals(field)) {
            tables = COLOR_DOWNSTREAM_TABLES;
        } else if ("sku".equals(field)) {
            tables = SKU_DOWNSTREAM_TABLES;
        } else if ("size".equals(field)) {
            tables = SIZE_DOWNSTREAM_TABLES;
        } else {
            return 0;
        }

        for (String[] tableInfo : tables) {
            String table = tableInfo[0];
            String refColumn = tableInfo[1];
            String refValue = "order_id".equals(refColumn) ? order.getId() : order.getOrderNo();
            try {
                int count = jdbcTemplate.update(
                        "UPDATE " + table + " SET " + column + " = ? WHERE " + refColumn + " = ? AND delete_flag = 0 AND tenant_id = ?",
                        newValue, refValue, order.getTenantId());
                total += count;
            } catch (Exception e) {
                log.warn("[syncDownstream] 同步失败: table={} column={} ref={}", table, column, refColumn, e);
            }
        }
        return total;
    }

    // ======================= 状态查询 → helper =======================

    /**
     * 获取订单的采购完成状态（用于工序明细显示）
     * 返回采购完成率、操作人、完成时间等信息
     *
     * @param orderId 订单ID
     * @return 采购状态信息：completed(是否完成)、completionRate(完成率)、operatorName(操作人)、completedTime(完成时间)
     */
    public Map<String, Object> getProcurementStatus(String orderId) {
        return helper.getProcurementStatus(orderId);
    }

    /**
     * 获取订单的所有工序节点状态（用于工序明细显示）
     * 返回裁剪、车缝、尾部、质检、入库等工序的完成状态、剩余数量、操作人等信息
     *
     * @param orderId 订单ID
     * @return 工序状态Map，key为工序阶段（cutting/sewing/finishing/quality/warehousing），value为状态详情
     */
    public Map<String, Map<String, Object>> getAllProcessStatus(String orderId) {
        return helper.getAllProcessStatus(orderId);
    }

    private void assertOrderBelongsToCurrentTenant(String orderId, String operation) {
        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId == null) return;
        ProductionOrder order = productionOrderQueryService.getDetailById(orderId);
        if (order == null) return;
        if (order.getTenantId() != null && !order.getTenantId().equals(currentTenantId)) {
            log.warn("[租户校验] {} 操作被拒绝: orderId={}, 当前租户={}, 订单租户={}",
                    operation, orderId, currentTenantId, order.getTenantId());
            throw new AccessDeniedException(operation + "操作失败：订单不属于当前租户");
        }
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            String orderFactoryId = order.getFactoryId();
            if (!ctxFactoryId.equals(orderFactoryId)) {
                log.warn("[工厂隔离] {} 操作被拒绝: orderId={}, 当前工厂={}, 订单工厂={}",
                        operation, orderId, ctxFactoryId, orderFactoryId);
                throw new AccessDeniedException(operation + "操作失败：订单不属于当前工厂");
            }
        }
    }

    private void evictCacheAfterCommit(String orderId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            orderListCacheHelper.evictTenantListCache();
            orderListCacheHelper.evictDetailCache(orderId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    orderListCacheHelper.evictTenantListCache();
                    orderListCacheHelper.evictDetailCache(orderId);
                } catch (Exception e) {
                    log.debug("[OrderCache] 缓存清除失败: orderId={}", orderId);
                }
            }
        });
    }

    private void evictTenantListCacheAfterCommit() {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            orderListCacheHelper.evictTenantListCache();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    orderListCacheHelper.evictTenantListCache();
                } catch (Exception e) {
                    log.debug("[OrderCache] 租户列表缓存清除失败");
                }
            }
        });
    }

    /**
     * 保存订单节点操作记录（工序节点备注等）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean saveNodeOperations(String id, String nodeOperations) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id不能为空");
        }
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, id)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .one();
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        assertOrderBelongsToCurrentTenant(id, "生产订单");
        order.setNodeOperations(nodeOperations);
        return productionOrderService.updateById(order);
    }

    /**
     * 外发工厂统计（对齐 PC 端 ExternalFactory FactorySidebar 7-Tag）
     * 按 factory_id 分组聚合，返回每个外发工厂的订单数/件数/款数/进行中/已完成/逾期/预警
     *
     * 业务规则（与 PC 端一致）：
     * - factory_type = 'EXTERNAL'
     * - 交期字段优先 expectedShipDate，回退 plannedEndDate
     * - 逾期：交期 < 今天 且 status != completed
     * - 预警：交期在 0-7 天内 且 status != completed
     * - 款号数按 styleNo 去重
     */
    public java.util.List<com.fashion.supplychain.production.dto.ExternalFactoryStatsVO> calcExternalFactoryStats() {
        // 工厂账号不应访问外发工厂全局统计
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return java.util.Collections.emptyList();
        }

        java.util.List<ProductionOrder> allOrders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, UserContext.tenantId())
                .eq(ProductionOrder::getFactoryType, "EXTERNAL")
                .list();

        java.util.Map<String, com.fashion.supplychain.production.dto.ExternalFactoryStatsVO> statsMap = new java.util.LinkedHashMap<>();
        java.util.Map<String, java.util.Set<String>> styleSetMap = new java.util.HashMap<>();
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        java.time.LocalDate today = now.toLocalDate();

        for (ProductionOrder order : allOrders) {
            String factoryId = order.getFactoryId() != null ? order.getFactoryId() : "unknown";
            String factoryName = order.getFactoryName() != null ? order.getFactoryName() : "未知工厂";
            com.fashion.supplychain.production.dto.ExternalFactoryStatsVO stat = statsMap.computeIfAbsent(
                    factoryId, k -> {
                        com.fashion.supplychain.production.dto.ExternalFactoryStatsVO s = new com.fashion.supplychain.production.dto.ExternalFactoryStatsVO();
                        s.setFactoryId(factoryId);
                        s.setFactoryName(factoryName);
                        return s;
                    });

            stat.setOrderCount(stat.getOrderCount() + 1);
            stat.setTotalQuantity(stat.getTotalQuantity() + (order.getOrderQuantity() != null ? order.getOrderQuantity() : 0));

            String status = order.getStatus() != null ? order.getStatus().trim().toLowerCase() : "";
            if ("completed".equals(status)) {
                stat.setCompletedCount(stat.getCompletedCount() + 1);
            } else if ("production".equals(status)) {
                stat.setInProgressCount(stat.getInProgressCount() + 1);
            }

            // 款号去重
            if (StringUtils.hasText(order.getStyleNo())) {
                java.util.Set<String> set = styleSetMap.computeIfAbsent(factoryId, k -> new java.util.HashSet<>());
                set.add(order.getStyleNo());
            }

            // 交期判断（优先 expectedShipDate，回退 plannedEndDate）
            java.time.LocalDateTime deliveryDate = order.getExpectedShipDate() != null
                    ? order.getExpectedShipDate()
                    : order.getPlannedEndDate();
            if (deliveryDate != null && !"completed".equals(status)) {
                long diffDays = java.time.temporal.ChronoUnit.DAYS.between(today, deliveryDate.toLocalDate());
                if (diffDays < 0) {
                    stat.setOverdueCount(stat.getOverdueCount() + 1);
                } else if (diffDays <= 7) {
                    stat.setWarningCount(stat.getWarningCount() + 1);
                }
            }
        }

        // 回填款号数
        for (java.util.Map.Entry<String, com.fashion.supplychain.production.dto.ExternalFactoryStatsVO> entry : statsMap.entrySet()) {
            java.util.Set<String> set = styleSetMap.get(entry.getKey());
            entry.getValue().setStyleCount(set != null ? set.size() : 0);
        }

        return new java.util.ArrayList<>(statsMap.values());
    }
}
