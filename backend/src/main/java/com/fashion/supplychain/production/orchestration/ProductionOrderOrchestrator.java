package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 生产订单编排器 - 系统核心业务编排
 *
 * 主要职责：
 * 1. 订单全生命周期管理（创建、更新、关闭、报废）
 * 2. 生产进度协调（进度更新、工序识别、工艺流锁定/回滚）
 * 3. 跨模块协同（BOM物料校验、财务记录同步、检验单生成）
 * 4. 业务规则强制（权限校验、数据一致性保证、事务管理）
 *
 * 核心流程：
 * - 订单创建：样衣校验 → BOM物料验证 → 工序模板加载 → 财务成本初始化
 * - 进度更新：扫码记录聚合 → 工序进度计算 → 订单状态流转 → 预警通知
 * - 订单关闭：入库数据校验 → 财务结算检查 → 状态更新 → Webhook推送
 *
 * 技术特点：
 * - 使用 @Transactional 保证跨服务调用的事务一致性
 * - 集成 UserContext 进行多租户数据隔离和权限控制
 * - 协调 MaterialPurchaseService、CuttingTaskService 等多个领域服务
 * - 支持工序外发、特殊工序处理、尺码智能排序
 *
 * 依赖服务：
 * - ProductionOrderService: 订单CRUD基础服务
 * - ProductionOrderQueryService: 订单查询专用服务
 * - MaterialPurchaseService: 物料采购服务
 * - CuttingTaskService: 裁剪任务服务
 * - StyleInfoService: 样衣信息服务
 *
 * 注意事项：
 * 1. 订单删除/报废前必须检查裁剪单和扩展记录，避免数据孤儿
 * 2. 工艺流锁定后不允许修改工序信息，需先回滚
 * 3. 订单关闭需确保财务对账单已生成，否则自动补充
 * 4. 所有状态变更均需记录操作日志，便于问题追溯
 *
 * @author System
 * @since 2024-10-01
 * @see ProductionOrderService
 * @see ScanRecordOrchestrator
 */
@Service
@Slf4j
public class ProductionOrderOrchestrator {

    public static final String CLOSE_SOURCE_MY_ORDERS = "myOrders";
    public static final String CLOSE_SOURCE_PRODUCTION_PROGRESS = "productionProgress";

    @Autowired
    private ReceivableOrchestrator receivableOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private ProductionOrderProgressOrchestrationService progressOrchestrationService;

    @Autowired
    private ProductionOrderFinanceOrchestrationService financeOrchestrationService;

    @Autowired
    private ProductionOrderFlowOrchestrationService flowOrchestrationService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private com.fashion.supplychain.production.service.ScanRecordService scanRecordService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired(required = false)
    private OperationLogService operationLogService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private ProductionOrderOrchestratorHelper helper;

    @Autowired
    private com.fashion.supplychain.production.service.ProductWarehousingService productWarehousingService;

    @Autowired
    private com.fashion.supplychain.production.service.ProductOutstockService productOutstockService;

    @Autowired
    private com.fashion.supplychain.finance.service.ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private com.fashion.supplychain.finance.service.PayrollSettlementService payrollSettlementService;

    @Autowired
    private com.fashion.supplychain.finance.service.PayrollSettlementItemService payrollSettlementItemService;

    @Autowired(required = false)
    private com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService ecOrderService;

    @Lazy
    @Autowired(required = false)
    private com.fashion.supplychain.system.orchestration.ChangeApprovalOrchestrator changeApprovalOrchestrator;

    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        IPage<ProductionOrder> page = productionOrderQueryService.queryPage(params);
        // 批量关联 EC 单号（出库打通后回填，失败不影响主流程）
        if (page != null && !page.getRecords().isEmpty() && ecOrderService != null) {
            try {
                List<String> orderNos = page.getRecords().stream()
                        .map(ProductionOrder::getOrderNo)
                        .filter(StringUtils::hasText)
                        .distinct()
                        .collect(java.util.stream.Collectors.toList());
                if (!orderNos.isEmpty()) {
                    List<com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder> ecOrders =
                            ecOrderService.list(
                                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<
                                            com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder>()
                                            .in(com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder::getProductionOrderNo, orderNos)
                            );
                    if (!ecOrders.isEmpty()) {
                        Map<String, com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder> ecMap =
                                ecOrders.stream().collect(java.util.stream.Collectors.toMap(
                                        com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder::getProductionOrderNo,
                                        o -> o,
                                        (a, b) -> a  // 同生产单对应多EC单时取首条
                                ));
                        page.getRecords().forEach(o -> {
                            com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder ec =
                                    ecMap.get(o.getOrderNo());
                            if (ec != null) {
                                o.setEcOrderNo(ec.getOrderNo());
                                o.setEcPlatform(ec.getPlatform());
                            }
                        });
                    }
                }
            } catch (Exception e) {
                log.warn("[EC关联] 批量关联EC单号失败，不影响主流程: {}", e.getMessage());
            }
        }
        // 批量填充次品数量（用于前端进度球红点预显示，失败不影响主流程）
        if (page != null && !page.getRecords().isEmpty()) {
            try {
                List<String> orderIds = page.getRecords().stream()
                        .map(ProductionOrder::getId)
                        .filter(id -> id != null && !id.isEmpty())
                        .distinct()
                        .collect(java.util.stream.Collectors.toList());
                if (!orderIds.isEmpty()) {
                    // 只 SELECT order_id/unqualified_quantity，避免 SELECT * 触发
                    // repair_status 等新增列在云端缺失时的 "Unknown column" 错误
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
                    if (!defectRecords.isEmpty()) {
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
                    }
                }
            } catch (Exception e) {
                log.warn("[次品数量] 批量填充次品数量失败，不影响主流程: {}", e.getMessage());
            }
        }
        return page;
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
                    for (Map<String, Object> item : items) {
                        if (item == null || item.isEmpty()) {
                            continue;
                        }
                        String color = item.get("color") == null ? null : String.valueOf(item.get("color")).trim();
                        String size = item.get("size") == null ? null : String.valueOf(item.get("size")).trim();
                        if (!StringUtils.hasText(color) || !StringUtils.hasText(size)) {
                            continue;
                        }
                        String skuNo = helper.buildSkuNo(orderNoFinal, styleNo, color, size);
                        item.put("skuNo", skuNo);
                        item.put("skuKey", skuNo);
                    }
                }
                order.setItems(items);
            } catch (Exception e) {
                log.warn("解析订单明细失败: {}", e.getMessage());
            }
        }

        return order;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean saveOrUpdateOrder(ProductionOrder productionOrder) {
        if (productionOrder == null) {
            throw new IllegalArgumentException("参数错误");
        }
        boolean isCreate = productionOrder != null && !StringUtils.hasText(productionOrder.getId());
        ProductionOrder existed = null;
        String remarkForLog = null;
        if (!isCreate) {
            String orderId = StringUtils.hasText(productionOrder.getId()) ? productionOrder.getId().trim() : null;
            if (!StringUtils.hasText(orderId)) {
                throw new IllegalArgumentException("参数错误");
            }
            existed = productionOrderService.getById(orderId);
            if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
                throw new NoSuchElementException("生产订单不存在");
            }
            TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");
            String st = helper.safeText(existed.getStatus()).toLowerCase();
            if ("completed".equals(st)) {
                throw new IllegalStateException("订单已完成，无法编辑");
            }
            String operRemark = productionOrder.getOperationRemark();
            remarkForLog = StringUtils.hasText(operRemark) ? operRemark.trim() : "";
            if (!StringUtils.hasText(remarkForLog)) {
                throw new IllegalStateException("请填写操作备注");
            }
        }

        // ✅ 验证人员字段（跟单员、纸样师）是否为系统中的真实用户
        helper.validatePersonnelFields(productionOrder);

        helper.validateUnitPriceSources(productionOrder);

        // 创建订单时检查纸样是否齐全（只警告，不阻止）
        if (isCreate && productionOrder != null && StringUtils.hasText(productionOrder.getStyleId())) {
            helper.checkPatternCompleteWarning(productionOrder.getStyleId());
        }

        boolean ok = productionOrderService.saveOrUpdateOrder(productionOrder);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }

        if (isCreate && productionOrder != null && StringUtils.hasText(productionOrder.getId())) {
            try {
                materialPurchaseService.generateDemandByOrderId(productionOrder.getId().trim(), false);
            } catch (Exception e) {
                String msg = e == null ? null : e.getMessage();
                if (msg == null || !msg.contains("已生成采购需求")) {
                    log.warn("Failed to generate material demand after order create: orderId={}",
                            productionOrder.getId(),
                            e);
                    scanRecordDomainService.insertOrchestrationFailure(
                            productionOrder,
                            "generateMaterialDemand",
                            msg == null ? "generateMaterialDemand failed" : ("generateMaterialDemand failed: " + msg),
                            LocalDateTime.now());
                }
            }

// 使用 TransactionSynchronization 在主事务提交成功后执行，保证 CRM 动作独立，异常不回滚、不影响生产主流程
            if (StringUtils.hasText(productionOrder.getCustomerId()) && productionOrder.getQuotationUnitPrice() != null && productionOrder.getOrderQuantity() != null) {
                org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            try {
                                java.math.BigDecimal amount = productionOrder.getQuotationUnitPrice()
                                        .multiply(new java.math.BigDecimal(productionOrder.getOrderQuantity()));
                                receivableOrchestrator.generateFromOrder(
                                        productionOrder.getCustomerId(),
                                        productionOrder.getId(),
                                        productionOrder.getOrderNo(),
                                        amount,
                                        productionOrder.getExpectedShipDate(),
                                        "生产订单自动生成应收款"
                                );
                                log.info("CRM 闭环 - 主事务提交后异步/独立生成应收款，订单号: {}", productionOrder.getOrderNo());
                            } catch (Exception e) {
                                log.error("主事务后独立生成应收款失败，已隔离异常，不响主流程: orderId={}", productionOrder.getId(), e);
                            }
                        }
                    }
                );
            }

            // PDF自动生成功能已移除
        }

        if (!isCreate && existed != null && StringUtils.hasText(remarkForLog)) {
            try {
                ProductionOrder logOrder = productionOrderService.getById(existed.getId());
                scanRecordDomainService.insertOrderOperationRecord(logOrder != null ? logOrder : existed, "编辑",
                        remarkForLog, LocalDateTime.now());
            } catch (Exception e) {
                log.warn("Failed to log order edit: orderId={}", existed.getId(), e);
            }
        }

        return true;
    }

    // PDF自动生成功能已移除

    @Transactional(rollbackFor = Exception.class)
    public boolean deleteById(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");
        boolean ok = productionOrderService.deleteById(oid);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }

        cascadeCleanupChildTables(oid);

        return true;
    }

    /**
     * 带审批检查的删除 — 非管理员删除生产订单需组织负责人审批
     */
    public Map<String, Object> deleteByIdWithApproval(String id, String reason) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        // 先查出订单号，用于审批记录展示
        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");

        if (changeApprovalOrchestrator != null) {
            Map<String, Object> opData = new HashMap<>();
            opData.put("orderId", oid);
            Map<String, Object> approvalResp = changeApprovalOrchestrator.checkAndCreateIfNeeded(
                    "ORDER_DELETE", oid, existed.getOrderNo(), opData, reason);
            if (approvalResp != null) {
                return approvalResp; // 审批申请已提交
            }
        }
        // 无需审批 → 直接删除
        deleteById(oid);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "删除成功");
        return result;
    }

    /**
     * 级联清理订单的所有子表数据（删除/报废时统一调用）
     * 包括：采购任务、裁剪任务、扫码记录、质检入库、出库记录、出货对账
     */
    @Transactional(rollbackFor = Exception.class)
    private void cascadeCleanupChildTables(String orderId) {
        try {
            materialPurchaseService.deleteByOrderId(orderId);
        } catch (Exception e) {
            log.warn("Failed to cascade delete material purchases: orderId={}", orderId, e);
        }

        try {
            cuttingTaskService.deleteByOrderId(orderId);
        } catch (Exception e) {
            log.warn("Failed to cascade delete cutting tasks: orderId={}", orderId, e);
        }

        try {
            scanRecordService.deleteByOrderId(orderId);
        } catch (Exception e) {
            log.warn("Failed to cascade delete scan records: orderId={}", orderId, e);
        }

        try {
            productWarehousingService.softDeleteByOrderId(orderId);
        } catch (Exception e) {
            log.warn("Failed to cascade delete warehousing records: orderId={}", orderId, e);
        }

        try {
            productOutstockService.softDeleteByOrderId(orderId);
        } catch (Exception e) {
            log.warn("Failed to cascade delete outstock records: orderId={}", orderId, e);
        }

        try {
            shipmentReconciliationService.removeByOrderId(orderId);
        } catch (Exception e) {
            log.warn("Failed to cascade delete shipment reconciliation: orderId={}", orderId, e);
        }

        try {
            payrollSettlementItemService.deleteByOrderId(orderId);
        } catch (Exception e) {
            log.warn("Failed to cascade delete payroll settlement items: orderId={}", orderId, e);
        }

        try {
            payrollSettlementService.deleteByOrderId(orderId);
        } catch (Exception e) {
            log.warn("Failed to cascade delete payroll settlements: orderId={}", orderId, e);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean scrapOrder(String id, String remark) {
        TenantAssert.assertTenantContext(); // 订单报废必须有租户上下文
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        String r = StringUtils.hasText(remark) ? remark.trim() : null;
        if (!StringUtils.hasText(r)) {
            throw new IllegalArgumentException("remark不能为空");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");
        String st = helper.safeText(existed.getStatus()).toLowerCase();
        if ("completed".equals(st)) {
            throw new IllegalStateException("订单已完成，无法报废");
        }

        // 已领取的采购记录说明面辅料已实质流转，禁止报废
        long receivedCount = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getOrderId, oid)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .ne(MaterialPurchase::getStatus, "pending")
                .count();
        if (receivedCount > 0) {
            throw new IllegalStateException("订单已有" + receivedCount + "条已领取的采购记录，无法报废");
        }

        // 待领取（pending）的采购记录随订单报废一并软删除
        List<MaterialPurchase> pendingList = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getOrderId, oid)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getStatus, "pending")
                .list();
        if (!pendingList.isEmpty()) {
            MaterialPurchase upd = new MaterialPurchase();
            upd.setDeleteFlag(1);
            upd.setUpdateTime(LocalDateTime.now());
            materialPurchaseService.lambdaUpdate()
                    .eq(MaterialPurchase::getOrderId, oid)
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .eq(MaterialPurchase::getStatus, "pending")
                    .update(upd);
            log.info("scrapOrder: 订单{}报废，自动作废{}条待领取采购记录", oid, pendingList.size());
        }

        // 2026-02-01: 移除采购完成限制 - 允许在任何阶段报废订单
        // ProductionOrder detail = productionOrderQueryService.getDetailById(oid);
        // ProductionOrder check = detail != null ? detail : existed;
        // if (isProcurementCompleted(check)) {
        //     throw new IllegalStateException("物料采购完成，无法报废");
        // }

        existed.setStatus("scrapped");
        existed.setOperationRemark(r);
        existed.setUpdateTime(LocalDateTime.now());

        boolean ok = productionOrderService.updateById(existed);
        if (!ok) {
            throw new IllegalStateException("报废失败");
        }

        try {
            scanRecordDomainService.insertOrderOperationRecord(existed, "报废", r, LocalDateTime.now());
        } catch (Exception e) {
            log.warn("Failed to log order scrap: orderId={}", oid, e);
        }
        return true;
    }

    public int recomputeProgressByStyleNo(String styleNo) {
        return progressOrchestrationService.recomputeProgressByStyleNo(styleNo);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateProductionProgress(String id, Integer progress, String rollbackRemark,
            String rollbackToProcessName) {
        return progressOrchestrationService.updateProductionProgress(id, progress, rollbackRemark,
                rollbackToProcessName);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateMaterialArrivalRate(String id, Integer rate) {
        return progressOrchestrationService.updateMaterialArrivalRate(id, rate);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        return financeOrchestrationService.completeProduction(id, tolerancePercent);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, String sourceModule) {
        return closeOrder(id, sourceModule, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, String sourceModule, String remark) {
        TenantAssert.assertTenantContext(); // 关闭订单必须有租户上下文
        String src = StringUtils.hasText(sourceModule) ? sourceModule.trim() : null;
        if (!StringUtils.hasText(src)) {
            throw new AccessDeniedException("仅允许在指定模块完成");
        }
        if (!CLOSE_SOURCE_MY_ORDERS.equals(src) && !CLOSE_SOURCE_PRODUCTION_PROGRESS.equals(src)) {
            throw new AccessDeniedException("仅允许在我的订单或生产进度完成");
        }
        ProductionOrder result = financeOrchestrationService.closeOrder(id);
        // 记录关闭操作日志
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
                try { String uid = UserContext.userId(); if (uid != null) opLog.setOperatorId(Long.parseLong(uid)); } catch (Exception ignored) {}
                opLog.setTenantId(UserContext.tenantId());
                opLog.setOperationTime(LocalDateTime.now());
                opLog.setStatus("success");
                operationLogService.save(opLog);
            }
        } catch (Exception e) {
            log.warn("记录订单关闭操作日志失败: orderId={}", id, e);
        }
        return result;
    }

    // ⚠️ REQUIRES_NEW：这三个方法经常被 try-catch 包围调用。
    // 若使用默认 REQUIRED，内部失败会把外层事务标记为 rollback-only，
    // 导致外层提交时抛 UnexpectedRollbackException（HTTP 500）。
    // 改为 REQUIRES_NEW 后，内部事务独立提交/回滚，不影响外层事务。
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public boolean autoCloseOrderIfEligible(String id) {
        return financeOrchestrationService.autoCloseOrderIfEligible(id);
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

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder lockProgressWorkflow(String id, String workflowJson) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作进度节点");
        }

        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");

        String st = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if ("completed".equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已完成，无法操作");
        }

        Integer locked = existed.getProgressWorkflowLocked();
        if (locked != null && locked == 1) {
            throw new IllegalStateException("流程已锁定");
        }

        String text = StringUtils.hasText(workflowJson) ? workflowJson.trim() : null;
        if (!StringUtils.hasText(text)) {
            throw new IllegalArgumentException("workflowJson不能为空");
        }

        String normalized = helper.normalizeProgressWorkflowJson(text);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalStateException("流程内容为空或不合法");
        }

        LocalDateTime now = LocalDateTime.now();
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        String uname = ctx == null ? null : ctx.getUsername();

        String uidTrim = uid == null ? null : uid.trim();
        uidTrim = StringUtils.hasText(uidTrim) ? uidTrim : null;
        String unameTrim = uname == null ? null : uname.trim();
        unameTrim = StringUtils.hasText(unameTrim) ? unameTrim : null;

        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowJson, normalized)
                .set(ProductionOrder::getProgressWorkflowLocked, 1)
                .set(ProductionOrder::getProgressWorkflowLockedAt, now)
                .set(ProductionOrder::getProgressWorkflowLockedBy, uidTrim)
                .set(ProductionOrder::getProgressWorkflowLockedByName, unameTrim)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // 同步工序单价到工序跟踪表（修复单价不同步问题）
        try {
            int synced = processTrackingOrchestrator.syncUnitPrices(oid);
            if (synced > 0) {
                log.info("锁定进度工作流时已同步{}条工序跟踪记录的单价", synced);
            }
        } catch (Exception e) {
            // 同步失败不影响主流程，记录日志
            log.warn("同步工序跟踪单价失败: {}", e.getMessage());
        }

        return getDetailById(oid);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder rollbackProgressWorkflow(String id, String reason) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }

        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        String remark = StringUtils.hasText(reason) ? reason.trim() : null;
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("reason不能为空");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");

        LocalDateTime now = LocalDateTime.now();
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowLocked, 0)
                .set(ProductionOrder::getProgressWorkflowLockedAt, null)
                .set(ProductionOrder::getProgressWorkflowLockedBy, null)
                .set(ProductionOrder::getProgressWorkflowLockedByName, null)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("退回失败");
        }
        try {
            scanRecordDomainService.insertRollbackRecord(existed, "流程退回", remark, now);
        } catch (Exception e) {
            log.warn("Failed to log workflow rollback: orderId={}", oid, e);
        }

        return getDetailById(oid);
    }

    /**
     * 手动确认采购完成（允许50%物料差异）
     * 业务规则：
     * - materialArrivalRate < 50%: 不允许确认，必须继续采购
     * - materialArrivalRate >= 50%: 允许人工确认"回料完成"，需填写备注原因（即使100%也需要人工确认）
     *
     * @param orderId 订单ID
     * @param remark 确认备注（说明物料到货情况和确认原因）
     * @return 更新后的订单
     */
    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder confirmProcurement(String orderId, String remark) {
        TenantAssert.assertTenantContext(); // 采购确认必须有租户上下文
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        if (!StringUtils.hasText(remark) || remark.trim().length() < 10) {
            throw new IllegalArgumentException("确认备注至少需要10个字符，请详细说明确认原因");
        }

        // 获取订单详情（包含物料到货率）
        ProductionOrder order = productionOrderQueryService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("订单不存在: " + orderId);
        }

        // 验证物料到货率
        Integer materialArrivalRate = order.getMaterialArrivalRate();
        if (materialArrivalRate == null) {
            materialArrivalRate = 0;
        }

        // 物料到货率<50%：不允许确认
        if (materialArrivalRate < 50) {
            throw new IllegalStateException(
                String.format("物料到货率不足50%%（当前%d%%），不允许确认采购完成，请继续采购",
                    materialArrivalRate)
            );
        }

        // 已经确认过了
        Integer manuallyCompleted = order.getProcurementManuallyCompleted();
        if (manuallyCompleted != null && manuallyCompleted == 1) {
            throw new IllegalStateException("该订单采购已确认完成，无需重复确认");
        }

        // 更新确认信息
        LocalDateTime now = LocalDateTime.now();
        String userId = UserContext.userId();
        String username = UserContext.username();

        ProductionOrder updateEntity = new ProductionOrder();
        updateEntity.setId(orderId);
        updateEntity.setProcurementManuallyCompleted(1);
        updateEntity.setProcurementConfirmedBy(userId);
        updateEntity.setProcurementConfirmedByName(username);
        updateEntity.setProcurementConfirmedAt(now);
        updateEntity.setProcurementConfirmRemark(remark.trim());

        // 计算采购完成后的进度（采购是第1个节点）
        try {
            String workflowJson = order.getProgressWorkflowJson();
            if (StringUtils.hasText(workflowJson)) {
                ObjectMapper mapper = new ObjectMapper();
                Map<String, Object> workflow = mapper.readValue(workflowJson, new TypeReference<Map<String, Object>>() {});
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> nodes = (List<Map<String, Object>>) workflow.get("nodes");

                if (nodes != null && !nodes.isEmpty()) {
                    int totalNodes = nodes.size();
                    // 采购完成 = 第1个节点完成 = 1/N * 100
                    int progress = (int) Math.round(100.0 / totalNodes);
                    updateEntity.setProductionProgress(progress);
                    log.info("Order procurement confirmed - updating progress: orderId={}, totalNodes={}, progress={}%",
                            orderId, totalNodes, progress);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to calculate procurement progress: orderId={}", orderId, e);
            // 即使计算失败也继续，不阻断采购确认流程
        }

        boolean updated = productionOrderService.updateById(updateEntity);
        if (!updated) {
            throw new RuntimeException("更新采购确认信息失败");
        }

        log.info("Order procurement manually confirmed: orderId={}, materialArrivalRate={}%, confirmedBy={}, remark={}",
                orderId, materialArrivalRate, username, remark);

        // 记录扫码日志（用于追踪）
        try {
            scanRecordDomainService.insertRollbackRecord(
                order,
                "采购手动确认",
                String.format("物料到货率%d%%，确认人：%s，备注：%s", materialArrivalRate, username, remark),
                now
            );
        } catch (Exception e) {
            log.warn("Failed to log procurement confirmation: orderId={}", orderId, e);
        }

        // 返回更新后的完整订单信息
        return productionOrderQueryService.getDetailById(orderId);
    }

    /**
     * 从样衣信息创建生产订单
     * 会自动复制：BOM表、工序表、尺寸表、文件附件等
     *
     * @param styleId 样衣ID
     * @param priceType 单价类型：process(工序单价) 或 sizePrice(多码单价)
     * @param remark 备注
     * @return 创建的订单信息
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createOrderFromStyle(String styleId, String priceType, String remark) {
        TenantAssert.assertTenantContext(); // 创建订单必须有租户上下文
        // 1. 验证参数
        if (!StringUtils.hasText(styleId)) {
            throw new IllegalArgumentException("样衣ID不能为空");
        }
        if (!StringUtils.hasText(priceType)) {
            throw new IllegalArgumentException("单价类型不能为空");
        }

        // 2. 获取样衣详细信息
        StyleInfo style = styleInfoService.getDetailById(Long.parseLong(styleId.trim()));
        if (style == null) {
            throw new NoSuchElementException("样衣信息不存在：" + styleId);
        }

        // 3. 检查样衣开发状态
        String progressNode = String.valueOf(style.getProgressNode() == null ? "" : style.getProgressNode()).trim();
        if (!"样衣完成".equals(progressNode)) {
            throw new IllegalStateException("样衣开发未完成，当前状态：" + progressNode + "，无法推送到下单管理");
        }

        // 4. 创建订单基本信息（暂时不保存到数据库，等所有数据准备好后一起保存）
        ProductionOrder newOrder = new ProductionOrder();
        newOrder.setStyleId(String.valueOf(style.getId()));
        newOrder.setStyleNo(style.getStyleNo());
        newOrder.setSkc(style.getSkc());
        newOrder.setStyleName(style.getStyleName());
        newOrder.setRemarks(StringUtils.hasText(remark) ? remark.trim() : null);

        // 从样衣同步跟单员和纸样师信息
        String merchandiserFromStyle = style.getOrderType(); // 跟单员存储在orderType字段
        if (StringUtils.hasText(merchandiserFromStyle)) {
            newOrder.setMerchandiser(merchandiserFromStyle.trim());
        }
        String patternMakerFromStyle = style.getSampleSupplier(); // 纸样师存储在sampleSupplier字段
        if (StringUtils.hasText(patternMakerFromStyle)) {
            newOrder.setPatternMaker(patternMakerFromStyle.trim());
        }

        // 记录创建人信息
        String currentUserId = UserContext.userId();
        String currentUsername = UserContext.username();
        if (StringUtils.hasText(currentUserId)) {
            newOrder.setCreatedById(currentUserId);
        }
        if (StringUtils.hasText(currentUsername)) {
            newOrder.setCreatedByName(currentUsername);
        }

        // 设置初始状态
        newOrder.setProductionProgress(0);
        newOrder.setMaterialArrivalRate(0);
        newOrder.setStatus("pending"); // 待生产

        // 5. 保存订单获取ID
        boolean saved = productionOrderService.save(newOrder);
        if (!saved || newOrder.getId() == null) {
            throw new RuntimeException("创建订单失败");
        }

        String newOrderId = newOrder.getId();
        String orderNo = newOrder.getOrderNo(); // 数据库自动生成

        log.info("Created order from style: styleId={}, styleNo={}, orderId={}, orderNo={}",
                styleId, style.getStyleNo(), newOrderId, orderNo);

        // 6. 复制相关数据（BOM、工序、尺寸、附件等）
        try {
            // 从样衣复制数据到订单（如需要可在此实现）
            // 当前订单创建时已包含所有必要信息（styleId关联样衣数据）
            // BOM、工序、尺寸等数据通过 styleId 动态关联，无需复制
            // 附件通过 StyleAttachment 表的 styleId 字段关联
            // 如果后续需要订单独立数据副本，可实现以下方法：
            // copyBomData(style.getId(), newOrderId);
            // copyProcessData(style.getId(), newOrderId, priceType);
            // copySizeData(style.getId(), newOrderId);
            // copyAttachments(style.getId(), newOrderId);

            log.info("Order created with styleId={}, data linked via foreign key", styleId);
        } catch (Exception e) {
            log.error("Failed to copy data from style to order: styleId={}, orderId={}",
                    styleId, newOrderId, e);
            // 如果复制失败，删除已创建的订单
            productionOrderService.removeById(newOrderId);
            throw new RuntimeException("复制样衣数据失败：" + e.getMessage(), e);
        }

        // 7. 返回结果
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", newOrderId);
        result.put("orderNo", orderNo);
        result.put("styleNo", style.getStyleNo());
        result.put("styleName", style.getStyleName());

        return result;
    }

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

    /**
     * 工序委派 - 将特定工序委派给工厂，并设置单价
     *
     * @param orderId 订单ID
     * @param processNode 工序节点（cutting/sewing/finishing/warehousing）
     * @param factoryId 工厂ID
     * @param unitPrice 单价（可选）
     */
    @Transactional(rollbackFor = Exception.class)
    public void delegateProcess(String orderId, String processNode, String factoryId, Double unitPrice) {
        // 验证订单是否存在
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new RuntimeException("订单不存在: " + orderId);
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");

        // 获取当前登录用户
        UserContext ctx = UserContext.get();
        String operatorName = ctx != null && StringUtils.hasText(ctx.getUsername()) ? ctx.getUsername() : "系统";

        // 构建委派记录
        String delegationRecord = String.format(
            "工序[%s]委派给工厂[%s]，单价[%.2f]元，操作时间[%s]，操作人[%s]",
            getProcessNodeName(processNode),
            factoryId,
            unitPrice != null ? unitPrice : 0.0,
            new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date()),
            operatorName
        );

        // 使用Jackson安全操作JSON
        String currentOperations = order.getNodeOperations();
        try {
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> opsMap = (currentOperations != null && !currentOperations.isBlank())
                    ? objectMapper.readValue(currentOperations, java.util.Map.class)
                    : new java.util.LinkedHashMap<>();
            opsMap.put(processNode, delegationRecord);
            order.setNodeOperations(objectMapper.writeValueAsString(opsMap));
        } catch (Exception e) {
            log.warn("解析nodeOperations失败，使用新Map: {}", e.getMessage());
            java.util.Map<String, Object> opsMap = new java.util.LinkedHashMap<>();
            opsMap.put(processNode, delegationRecord);
            try {
                order.setNodeOperations(objectMapper.writeValueAsString(opsMap));
            } catch (Exception ex) {
                order.setNodeOperations("{\"" + processNode + "\":\"" + delegationRecord.replace("\"", "\\\"") + "\"}");
            }
        }

        productionOrderService.updateById(order);

        log.info("工序委派成功 - 订单:{}, 工序:{}, 工厂:{}, 单价:{}",
            orderId, processNode, factoryId, unitPrice);
    }

    /**
     * 获取工序节点的中文名称
     */
    private String getProcessNodeName(String processNode) {
        return helper.getProcessNodeName(processNode);
    }
}
