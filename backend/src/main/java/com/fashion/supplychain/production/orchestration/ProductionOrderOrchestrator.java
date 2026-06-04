package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.intelligence.orchestration.OrderDecisionCaptureOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningOutcomeOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.helper.OrderListCacheHelper;
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

    @Autowired(required = false)
    private com.fashion.supplychain.websocket.service.WebSocketService webSocketService;

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
                            );
            if (ecOrders.isEmpty()) return;
            Map<String, com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder> ecMap =
                    ecOrders.stream().collect(java.util.stream.Collectors.toMap(
                            com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder::getProductionOrderNo,
                            o -> o,
                            (a, b) -> a
                    ));
            page.getRecords().forEach(o -> {
                com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder ec =
                        ecMap.get(o.getOrderNo());
                if (ec != null) {
                    o.setEcOrderNo(ec.getOrderNo());
                    o.setEcPlatform(ec.getPlatform());
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
        boolean result = creationHelper.saveOrUpdateOrder(productionOrder);
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
        evictCacheAfterCommit(id);
        if (result) {
            tryNotifyProgressChanged(id);
        }
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateMaterialArrivalRate(String id, Integer rate) {
        boolean result = progressOrchestrationService.updateMaterialArrivalRate(id, rate);
        evictCacheAfterCommit(id);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        assertOrderBelongsToCurrentTenant(id, "完成生产");
        boolean result = financeOrchestrationService.completeProduction(id, tolerancePercent);
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

    private void tryNotifyProgressChanged(String orderId) {
        try {
            if (webSocketService == null) return;
            String operatorId = UserContext.userId();
            if (operatorId == null || operatorId.isEmpty()) return;
            ProductionOrder order = productionOrderQueryService.getDetailById(orderId);
            if (order == null) return;
            webSocketService.sendToUser(operatorId,
                    com.fashion.supplychain.websocket.enums.WebSocketMessageType.ORDER_PROGRESS_CHANGED,
                    java.util.Map.of("orderNo", order.getOrderNo(),
                            "progress", order.getProductionProgress() != null ? order.getProductionProgress() : 0,
                            "currentStage", order.getCurrentProcessName() != null ? order.getCurrentProcessName() : "",
                            "timestamp", System.currentTimeMillis()));
        } catch (Exception e) {
            log.debug("[ProgressNotify] 进度变更WebSocket通知失败（不阻断）: orderId={}, err={}", orderId, e.getMessage());
        }
    }
}
