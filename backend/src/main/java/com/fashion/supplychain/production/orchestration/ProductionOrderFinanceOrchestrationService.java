package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.orchestration.PayrollSettlementOrchestrator;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.common.ParamUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.integration.openapi.service.WebhookPushService;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.production.helper.OrderReconciliationHelper;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ThreadLocalRandom;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderFinanceOrchestrationService {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private PayrollSettlementOrchestrator payrollSettlementOrchestrator;

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private com.fashion.supplychain.production.service.ScanRecordService scanRecordService;

    @Autowired
    private ProductOutstockService productOutstockService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private OrderReconciliationHelper orderReconciliationHelper;

    @Autowired(required = false)
    private WebhookPushService webhookPushService;

    /** 智能预测回填（可选注入，模块未启用时不影响关单流程） */
    @Autowired(required = false)
    private IntelligencePredictionLogMapper intelligencePredictionLogMapper;

    @Autowired
    private DeliverySlaOrchestrator deliverySlaOrchestrator;

    /**
     * ★ 自注入：解决同类内部方法调用不经过 AOP 代理的问题
     * 使用 @Lazy 避免循环依赖
     *
     * 根因：Spring AOP 默认使用代理模式，同一个类内部的方法调用（this.xxx()）不会经过代理，
     * 导致内部方法上的 @Transactional(propagation=REQUIRES_NEW) 注解不生效。
     * 自注入后通过 self.xxx() 调用，会经过代理，@Transactional 正常生效。
     */
    @Autowired
    @Lazy
    private ProductionOrderFinanceOrchestrationService self;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @Transactional(rollbackFor = Exception.class)
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        assertCompletePermission();
        String oid = assertValidOrderId(id);
        ProductionOrder order = loadOrderForComplete(oid);
        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) throw new IllegalStateException("订单数量异常，无法结单");

        BigDecimal tp = normalizeTolerance(tolerancePercent);
        long qualifiedSum = sumQualifiedWarehousing(oid);
        if (qualifiedSum <= 0) throw new IllegalStateException("该订单合格入库数量为0，无法结单");

        assertPackagingComplete(oid, qualifiedSum);
        assertQuantityWithinTolerance(qualifiedSum, orderQty, tp);

        markOrderCompleted(oid, qualifiedSum, order.getStatus());
        pushCompletionWebhook(order, qualifiedSum, orderQty);
        backfillPredictionLogs(oid);
        triggerPayrollSettlementGeneration(oid);
        return true;
    }

    private void assertCompletePermission() {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限完成订单，需要主管及以上权限");
        }
    }

    private String assertValidOrderId(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) throw new IllegalArgumentException("订单ID不能为空");
        return oid;
    }

    private ProductionOrder loadOrderForComplete(String oid) {
        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equals(st)) throw new IllegalArgumentException("订单已完成");
        return order;
    }

    private BigDecimal normalizeTolerance(BigDecimal tolerancePercent) {
        BigDecimal tp = tolerancePercent != null ? tolerancePercent : new BigDecimal("0.10");
        if (tp.compareTo(new BigDecimal("0.05")) < 0) tp = new BigDecimal("0.05");
        if (tp.compareTo(new BigDecimal("0.10")) > 0) tp = new BigDecimal("0.10");
        return tp;
    }

    private long sumQualifiedWarehousing(String orderId) {
        List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, orderId)
                .eq(ProductWarehousing::getDeleteFlag, 0));
        if (list == null || list.isEmpty()) throw new IllegalStateException("该订单暂无入库记录，无法结单");
        long sum = 0;
        for (ProductWarehousing w : list) {
            if (w == null) continue;
            int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
            if (q > 0) sum += q;
        }
        return sum;
    }

    private void assertPackagingComplete(String orderId, long qualifiedSum) {
        long packagingDone = scanRecordDomainService.computePackagingDoneQuantity(orderId);
        if (packagingDone < qualifiedSum) throw new IllegalStateException("请先完成包装后再入库结单");
    }

    private void assertQuantityWithinTolerance(long qualifiedSum, int orderQty, BigDecimal tp) {
        long diff = Math.abs(qualifiedSum - (long) orderQty);
        BigDecimal allowDiff = tp.multiply(BigDecimal.valueOf(orderQty)).setScale(0, RoundingMode.CEILING);
        if (BigDecimal.valueOf(diff).compareTo(allowDiff) > 0) {
            throw new IllegalStateException("入库数量与订单数量差异超出允许范围");
        }
    }

    private void markOrderCompleted(String oid, long qualifiedSum, String previousStatus) {
        LocalDateTime now = LocalDateTime.now();
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getCompletedQuantity, (int) Math.min(Integer.MAX_VALUE, qualifiedSum))
                .set(ProductionOrder::getProductionProgress, 100)
                .set(ProductionOrder::getStatus, "completed")
                .set(ProductionOrder::getActualEndDate, now)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) throw new IllegalStateException("操作失败");
    }

    private void pushCompletionWebhook(ProductionOrder order, long qualifiedSum, int orderQty) {
        if (webhookPushService == null || order.getOrderNo() == null) return;
        try {
            String prevStatus = order.getStatus() == null ? "" : order.getStatus().trim();
            webhookPushService.pushOrderStatusChange(
                order.getOrderNo(), prevStatus, "completed",
                Map.of("completedQuantity", qualifiedSum, "orderQuantity", orderQty));
        } catch (Exception e) {
            log.warn("Webhook推送订单完成状态失败: orderNo={}", order.getOrderNo(), e);
        }
    }

    private void backfillPredictionLogs(String oid) {
        if (intelligencePredictionLogMapper == null) return;
        try {
            int backfilled = intelligencePredictionLogMapper.backfillByOrderId(oid, LocalDateTime.now(), UserContext.tenantId());
            if (backfilled > 0) {
                log.info("[智能回填] 订单 {} 完成（completeProduction），回填 {} 条预测记录", oid, backfilled);
            }
        } catch (Exception ex) {
            log.warn("[智能回填] 回填失败，不影响关单流程: orderId={}", oid, ex);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id) {
        return closeOrder(id, false);
    }

    /**
     * 关闭订单
     * @param specialClose true=特需关单，跳过90%入库率校验（适用于长期延期/生产事故等特殊情况），此时备注原因必须由上层保证非空
     */
    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, boolean specialClose) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限完成");
        }
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equals(st)) {
            ProductionOrder detail = productionOrderService.getDetailById(oid);
            if (detail == null) {
                throw new NoSuchElementException("订单不存在");
            }
            return detail;
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            throw new IllegalStateException("订单数量异常，无法完成");
        }

        int cuttingQty = 0;
        try {
            TenantAssert.assertTenantContext();
            Long tid = com.fashion.supplychain.common.UserContext.tenantId();
            QueryWrapper<CuttingBundle> qw = new QueryWrapper<CuttingBundle>()
                    .select("COALESCE(SUM(quantity), 0) as totalQuantity")
                    .eq("production_order_id", oid);
            qw.eq("tenant_id", tid);
            List<Map<String, Object>> rows = cuttingBundleMapper.selectMaps(qw);
            if (rows != null && !rows.isEmpty()) {
                Object v = ParamUtils.getIgnoreCase(rows.get(0), "totalQuantity");
                if (v instanceof Number) {
                    cuttingQty = ((Number) v).intValue();
                } else if (v != null) {
                    cuttingQty = Integer.parseInt(String.valueOf(v).replaceAll("[^0-9-]", ""));
                }
            }
        } catch (Exception e) {
            log.warn("Failed to aggregate cutting quantity when closing order: orderId={}", oid, e);
        }
        cuttingQty = Math.max(0, cuttingQty);

        if (cuttingQty <= 0) {
            Integer orderCuttingQty = order.getCuttingQuantity();
            if (orderCuttingQty != null && orderCuttingQty > 0) {
                cuttingQty = orderCuttingQty;
                log.info("关单裁剪数回退：orderId={}, cuttingBundle聚合为0, 使用order.cuttingQuantity={}", oid, orderCuttingQty);
            }
        }

        if (cuttingQty <= 0) {
            int completedQty = order.getCompletedQuantity() == null ? 0 : order.getCompletedQuantity();
            if (completedQty > 0) {
                cuttingQty = completedQty;
                log.info("关单裁剪数回退：orderId={}, 使用completedQuantity={}", oid, completedQty);
            }
        }

        int warehousingQualified = productWarehousingService.sumQualifiedByOrderId(oid);
        if (warehousingQualified <= 0) {
            Integer completedQty = order.getCompletedQuantity();
            if (completedQty != null && completedQty > 0) {
                warehousingQualified = completedQty;
                log.info("关单入库数回退：orderId={}, ProductWarehousing聚合为0, 使用order.completedQuantity={}", oid, completedQty);
            }
        }
        if (warehousingQualified <= 0) {
            try {
                QueryWrapper<ScanRecord> srQw =
                        new QueryWrapper<ScanRecord>()
                                .select("COALESCE(SUM(quantity), 0) as totalQty")
                                .eq("order_id", oid)
                                .eq("scan_type", "warehouse")
                                .eq("scan_result", "success");
                java.util.List<java.util.Map<String, Object>> srRows = scanRecordService.listMaps(srQw);
                if (srRows != null && !srRows.isEmpty()) {
                    Object v = srRows.get(0).get("totalQty");
                    if (v instanceof Number) {
                        int fromScan = ((Number) v).intValue();
                        if (fromScan > 0) {
                            warehousingQualified = fromScan;
                            log.info("关单入库数最终回退：orderId={}, 从ScanRecord获取warehouse扫码数量={}", oid, fromScan);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("关单入库数最终回退失败（ScanRecord查询）: orderId={}", oid, e);
            }
        }

        if (!specialClose) {
            if (cuttingQty <= 0) {
                throw new IllegalStateException("裁剪数量不足，无法正常关单。如需强制关单，请使用特需关单并填写原因");
            }
            int minRequired = (int) Math.ceil(cuttingQty * 0.9);
            if (warehousingQualified < minRequired) {
                throw new IllegalStateException(
                    String.format("成品合格入库数量不足（当前%d/%d），无法正常关单。如需强制关单，请使用特需关单",
                        warehousingQualified, minRequired));
            }
        } else {
            log.info("特需关单：orderId={}, specialClose=true, cuttingQty={}, warehousingQualified={}", oid, cuttingQty, warehousingQualified);
        }

        LocalDateTime now = LocalDateTime.now();
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getCompletedQuantity, warehousingQualified)
                .set(ProductionOrder::getProductionProgress, 100)
                .set(ProductionOrder::getStatus, "completed")
                .set(ProductionOrder::getActualEndDate, now)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("完成失败");
        }

        // 同步内存对象，确保对账数量 = 实际合格入库数（DB 已写入但内存仍是旧值）
        order.setCompletedQuantity(warehousingQualified);

        // 【关键】关单时自动创建订单结算（本厂+加工厂统一处理）
        // 统一走 ensureShipmentReconciliationForOrder 入口，避免双重创建
        try {
            self.ensureShipmentReconciliationForOrder(oid);
        } catch (Exception e) {
            log.error("创建订单结算失败: orderId={}", oid, e);
            throw new RuntimeException("创建订单结算失败，关单未完成: " + e.getMessage(), e);
        }

        // 【智能学习】关单时回填预测记录，自动闭合数据飞轮
        if (intelligencePredictionLogMapper != null) {
            try {
                int backfilled = intelligencePredictionLogMapper.backfillByOrderId(oid, now, com.fashion.supplychain.common.UserContext.tenantId());
                if (backfilled > 0) {
                    log.info("[智能回填] 订单 {} 关单（closeOrder），回填 {} 条预测记录", oid, backfilled);
                }
            } catch (Exception ex) {
                log.warn("[智能回填] 回填失败，不影响关单流程: orderId={}", oid, ex);
            }
        }

        // 【交付SLA】关单时计算并持久化SLA达标状态
        try {
            ProductionOrder refreshed = productionOrderService.getById(oid);
            deliverySlaOrchestrator.computeAndPersistSla(refreshed);
        } catch (Exception ex) {
            log.warn("[交付SLA] 计算失败，不影响关单流程: orderId={}", oid, ex);
        }

        triggerPayrollSettlementGeneration(oid);

        ProductionOrder detail = productionOrderService.getDetailById(oid);
        if (detail == null) {
            throw new NoSuchElementException("订单不存在");
        }
        return detail;
    }

    /**
     * 批量关单 — 支持小云AI指令批量关闭订单
     * 每个订单独立事务，单个失败不影响其他订单
     */
    public List<Map<String, Object>> batchCloseOrders(List<String> orderIds, String sourceModule, String remark, boolean specialClose) {
        List<Map<String, Object>> results = new ArrayList<>();
        for (String oid : orderIds) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("orderId", oid);
            try {
                ProductionOrder result = transactionTemplate.execute(status -> {
                    try {
                        return self.closeOrder(oid, specialClose);
                    } catch (Exception e) {
                        status.setRollbackOnly();
                        throw new RuntimeException(e.getMessage(), e);
                    }
                });
                item.put("success", true);
                item.put("orderNo", result != null ? result.getOrderNo() : oid);
            } catch (Exception e) {
                item.put("success", false);
                String reason = e.getCause() != null ? e.getCause().getMessage() : e.getMessage();
                item.put("reason", reason);
                log.warn("批量关单失败: orderId={}, reason={}", oid, reason);
            }
            results.add(item);
        }
        return results;
    }

    /**
     * 确保订单的财务记录存在
     *
     * ★ 移除 @Transactional：此方法只做查询和条件判断，实际事务操作委托给 ensureShipmentReconciliationForOrder
     * 这样可以避免同类调用时事务传播导致的 "rollback-only" 污染问题
     */
    public boolean ensureFinanceRecordsForOrder(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        int qty = productWarehousingService.sumQualifiedByOrderId(oid);
        if (qty > 0) {
            // 有合格入库记录时，确保出货对账单存在并更新利润
            // ★ 通过 self 调用，让 @Transactional(REQUIRES_NEW) 生效，隔离事务
            try {
                self.ensureShipmentReconciliationForOrder(oid);
            } catch (Exception e) {
                // 出货对账单创建失败不应阻断入库主流程
                log.warn("ensureFinanceRecordsForOrder: 确保出货对账单时异常（不阻断入库）orderId={}, error={}",
                        oid, e.getMessage());
            }
            return true;
        }
        return false;
    }

    /**
     * 确保出货对账单存在
     *
     * ★ 使用 REQUIRES_NEW：该方法在独立事务中执行，失败不会污染外层事务
     * 通过 self.xxx() 调用（而非 this.xxx()）才能让这个注解生效
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public boolean ensureShipmentReconciliationForOrder(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        Map<String, Object> orderDetails = parseOrderDetails(order);
        String customerId = resolveCustomerId(orderDetails);
        String customerName = resolveCustomerName(orderDetails);

        int shippedQty = productOutstockService.sumOutstockByOrderId(oid);
        if (shippedQty <= 0) {
            try {
                ShipmentReconciliation existed = shipmentReconciliationService.lambdaQuery()
                        .select(ShipmentReconciliation::getId, ShipmentReconciliation::getStatus)
                        .eq(ShipmentReconciliation::getOrderId, oid)
                        .orderByDesc(ShipmentReconciliation::getCreateTime)
                        .last("limit 1")
                        .one();
                if (existed != null && StringUtils.hasText(existed.getId())) {
                    String st = existed.getStatus() == null ? "" : existed.getStatus().trim();
                    if (!StringUtils.hasText(st) || "pending".equalsIgnoreCase(st)) {
                        shipmentReconciliationService.removeById(existed.getId().trim());
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to cleanup pending shipment reconciliation when no outstock quantity: orderId={}",
                        oid,
                        e);
            }
            return false;
        }

        LocalDateTime now = LocalDateTime.now();
        String uid = null;
        try {
            UserContext ctx = UserContext.get();
            String tmpUid = ctx == null ? null : ctx.getUserId();
            if (tmpUid != null) {
                String normalizedUid = tmpUid.trim();
                if (!normalizedUid.isEmpty()) {
                    uid = normalizedUid;
                }
            }
        } catch (Exception e) {
            log.warn("[Finance] 用户信息获取失败: {}", e.getMessage());
            uid = null;
        }
        ShipmentReconciliation sr;
        try {
            sr = shipmentReconciliationService.lambdaQuery()
                    .eq(ShipmentReconciliation::getOrderId, oid)
                    .orderByDesc(ShipmentReconciliation::getCreateTime)
                    .last("limit 1")
                    .one();
        } catch (Exception e) {
            log.warn("Failed to query existing shipment reconciliation: orderId={}", oid, e);
            sr = null;
        }

        if (sr == null && StringUtils.hasText(order.getOrderNo())) {
            try {
                sr = shipmentReconciliationService.lambdaQuery()
                        .eq(ShipmentReconciliation::getOrderNo, order.getOrderNo().trim())
                        .orderByDesc(ShipmentReconciliation::getCreateTime)
                        .last("limit 1")
                        .one();
            } catch (Exception e) {
                log.warn("Failed to query existing shipment reconciliation by orderNo: orderId={}, orderNo={}",
                        oid,
                        order.getOrderNo(),
                        e);
                sr = null;
            }
        }

        if (sr == null) {
            sr = new ShipmentReconciliation();
            sr.setReconciliationNo(buildFinanceNo("SR", now));
            sr.setCustomerId(null);
            sr.setCustomerName("");
            sr.setStyleId(order.getStyleId());
            sr.setStyleNo(order.getStyleNo());
            sr.setStyleName(order.getStyleName());
            sr.setOrderId(order.getId());
            sr.setOrderNo(order.getOrderNo());
            sr.setStatus("pending");
            sr.setCreateTime(now);
            if (StringUtils.hasText(uid)) {
                sr.setCreateBy(uid);
                sr.setUpdateBy(uid);
            }
        } else {
            String st = sr.getStatus() == null ? "" : sr.getStatus().trim();
            if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st)) {
                ShipmentReconciliation patch = new ShipmentReconciliation();
                patch.setId(sr.getId());
                boolean needPatch = false;

                if (!StringUtils.hasText(sr.getStyleId()) && StringUtils.hasText(order.getStyleId())) {
                    patch.setStyleId(order.getStyleId());
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getStyleNo()) && StringUtils.hasText(order.getStyleNo())) {
                    patch.setStyleNo(order.getStyleNo());
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getStyleName()) && StringUtils.hasText(order.getStyleName())) {
                    patch.setStyleName(order.getStyleName());
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getOrderId()) && StringUtils.hasText(order.getId())) {
                    patch.setOrderId(order.getId());
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getOrderNo()) && StringUtils.hasText(order.getOrderNo())) {
                    patch.setOrderNo(order.getOrderNo());
                    needPatch = true;
                }

                if (!StringUtils.hasText(sr.getCustomerId()) && StringUtils.hasText(customerId)) {
                    patch.setCustomerId(customerId);
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getCustomerName()) && StringUtils.hasText(customerName)) {
                    patch.setCustomerName(customerName);
                    needPatch = true;
                }

                if (needPatch) {
                    patch.setUpdateTime(now);
                    if (StringUtils.hasText(uid)) {
                        patch.setUpdateBy(uid);
                        if (!StringUtils.hasText(sr.getCreateBy())) {
                            patch.setCreateBy(uid);
                        }
                    }
                    shipmentReconciliationService.updateById(patch);
                }
                return true;
            }
        }

        if (!StringUtils.hasText(sr.getStyleId())) {
            sr.setStyleId(order.getStyleId());
        }
        if (!StringUtils.hasText(sr.getStyleNo())) {
            sr.setStyleNo(order.getStyleNo());
        }
        if (!StringUtils.hasText(sr.getStyleName())) {
            sr.setStyleName(order.getStyleName());
        }
        if (!StringUtils.hasText(sr.getOrderId())) {
            sr.setOrderId(order.getId());
        }
        if (!StringUtils.hasText(sr.getOrderNo())) {
            sr.setOrderNo(order.getOrderNo());
        }

        if (StringUtils.hasText(customerId) && !StringUtils.hasText(sr.getCustomerId())) {
            sr.setCustomerId(customerId);
        }
        if (StringUtils.hasText(customerName) && !StringUtils.hasText(sr.getCustomerName())) {
            sr.setCustomerName(customerName);
        }

        // 尝试从款号资料中获取单价信息
        BigDecimal unitPrice = sr.getUnitPrice();
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            try {
                // 正确处理款号 ID，可能是字符串格式
                if (StringUtils.hasText(order.getStyleId())) {
                    String sidRaw0 = order.getStyleId();
                    String sidRaw = StringUtils.hasText(sidRaw0) ? sidRaw0.trim() : null;
                    if (StringUtils.hasText(sidRaw) && isAllDigits(sidRaw)) {
                        Long styleId = Long.parseLong(sidRaw);
                        StyleQuotation quotation = styleQuotationService.getByStyleId(styleId);
                        if (quotation != null && quotation.getTotalPrice() != null
                                && quotation.getTotalPrice().compareTo(BigDecimal.ZERO) > 0) {
                            unitPrice = quotation.getTotalPrice();
                            sr.setUnitPrice(unitPrice);
                        }
                    } else if (StringUtils.hasText(order.getStyleNo())) {
                        StyleInfo styleInfo = styleInfoService.lambdaQuery()
                                .eq(StyleInfo::getStyleNo, order.getStyleNo().trim())
                                .one();
                        if (styleInfo != null) {
                            StyleQuotation quotation = styleQuotationService.getByStyleId(styleInfo.getId());
                            if (quotation != null && quotation.getTotalPrice() != null
                                    && quotation.getTotalPrice().compareTo(BigDecimal.ZERO) > 0) {
                                unitPrice = quotation.getTotalPrice();
                                sr.setUnitPrice(unitPrice);
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to get unit price from style quotation: styleId={}, styleNo={}", order.getStyleId(),
                        order.getStyleNo(), e);
            }
        }

        sr.setQuantity(Math.max(0, shippedQty));

        boolean isOwnFactory = orderReconciliationHelper != null && orderReconciliationHelper.isOwnFactory(order);

        if (isOwnFactory) {
            BigDecimal scanCost = BigDecimal.ZERO;
            try {
                scanCost = calculateScanCostForOrder(oid);
            } catch (Exception e) {
                log.warn("计算扫码成本失败: orderId={}", oid, e);
            }
            sr.setUnitPrice(BigDecimal.ZERO);
            sr.setTotalAmount(scanCost);
            sr.setFinalAmount(scanCost);
            if (sr.getDeductionAmount() == null) {
                sr.setDeductionAmount(BigDecimal.ZERO);
            }
        } else {
            BigDecimal up = sr.getUnitPrice();
            if (up == null || up.compareTo(BigDecimal.ZERO) <= 0) {
                up = resolveLastUnitPrice(oid, "shipment");
                if (up == null || up.compareTo(BigDecimal.ZERO) <= 0) {
                    try {
                        String sno = order.getStyleNo();
                        if (StringUtils.hasText(sno)) {
                            StyleInfo styleInfo = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
                                    .eq(StyleInfo::getStyleNo, sno.trim())
                                    .last("limit 1"));
                            if (styleInfo != null && styleInfo.getPrice() != null
                                    && styleInfo.getPrice().compareTo(BigDecimal.ZERO) > 0) {
                                up = styleInfo.getPrice();
                            }
                        }
                    } catch (Exception e) {
                        log.warn("Failed to resolve style price for shipment reconciliation: orderId={}, styleNo={}", oid,
                                order.getStyleNo(), e);
                    }
                }
            }

            BigDecimal factoryUnitPrice = order.getFactoryUnitPrice() != null ? order.getFactoryUnitPrice() : BigDecimal.ZERO;
            if (factoryUnitPrice.compareTo(BigDecimal.ZERO) > 0) {
                up = factoryUnitPrice;
            }

            sr.setUnitPrice(up);
            if (sr.getDeductionAmount() == null) {
                sr.setDeductionAmount(BigDecimal.ZERO);
            }
            if (up == null) {
                up = BigDecimal.ZERO;
                sr.setUnitPrice(up);
            }
            BigDecimal total = up.multiply(BigDecimal.valueOf(Math.max(0, shippedQty))).setScale(2, RoundingMode.HALF_UP);
            sr.setTotalAmount(total);
            sr.setFinalAmount(total.subtract(sr.getDeductionAmount()).setScale(2, RoundingMode.HALF_UP));
        }

        if (sr instanceof ShipmentReconciliation) {
            try {
                java.lang.reflect.Method setOwn = sr.getClass().getMethod("setIsOwnFactory", Integer.class);
                setOwn.invoke(sr, isOwnFactory ? 1 : 0);
            } catch (Exception e) {
                log.warn("[FinanceOrch] 设置isOwnFactory失败: orderId={}, error={}", sr.getId(), e.getMessage());
            }
        }

        sr.setReconciliationDate(now);
        sr.setUpdateTime(now);
        if (StringUtils.hasText(uid)) {
            sr.setUpdateBy(uid);
            if (!StringUtils.hasText(sr.getCreateBy())) {
                sr.setCreateBy(uid);
            }
        }
        return shipmentReconciliationService.saveOrUpdate(sr);
    }

    private Map<String, Object> parseOrderDetails(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getOrderDetails())) {
            return null;
        }
        try {
            String json = order.getOrderDetails().trim();
            if (json.startsWith("[")) {
                // orderDetails 是数组格式（SKU列表），取第一个元素
                java.util.List<Map<String, Object>> list = objectMapper.readValue(json,
                    new TypeReference<java.util.List<Map<String, Object>>>() {});
                return (list != null && !list.isEmpty()) ? list.get(0) : null;
            }
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            log.warn("Failed to parse production order orderDetails: orderId={}", order.getId(), e);
            return null;
        }
    }

    private String resolveCustomerId(Map<String, Object> details) {
        String v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customerId"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customer_id"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        Object customer = ParamUtils.getIgnoreCase(details, "customer");
        if (customer instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) customer;
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "id"));
            if (StringUtils.hasText(v)) {
                return v;
            }
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "customerId"));
            if (StringUtils.hasText(v)) {
                return v;
            }
        }
        return null;
    }

    private String resolveCustomerName(Map<String, Object> details) {
        String v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customerName"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customer_name"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        Object customer = ParamUtils.getIgnoreCase(details, "customer");
        if (customer instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) customer;
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "name"));
            if (StringUtils.hasText(v)) {
                return v;
            }
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "customerName"));
            if (StringUtils.hasText(v)) {
                return v;
            }
        }
        v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customer"));
        return StringUtils.hasText(v) ? v : null;
    }

    @Transactional(rollbackFor = Exception.class)
    public int backfillFinanceRecords() {
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .and(w -> w.gt(ProductionOrder::getCompletedQuantity, 0).or().eq(ProductionOrder::getStatus,
                        "completed"))
                .orderByDesc(ProductionOrder::getUpdateTime)
                .last("LIMIT 5000")
                .list();
        if (orders == null || orders.isEmpty()) {
            return 0;
        }

        int touched = 0;
        LocalDateTime now = LocalDateTime.now();
        for (ProductionOrder o : orders) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            int qty = o.getCompletedQuantity() == null ? 0 : o.getCompletedQuantity();
            if (qty <= 0) {
                qty = productWarehousingService.sumQualifiedByOrderId(o.getId());
            }
            if (qty <= 0) {
                continue;
            }
            try {
                ensureShipmentReconciliationForOrder(o.getId());
            } catch (Exception e) {
                log.warn("Failed to ensure shipment reconciliation during backfill: orderId={}", o.getId(), e);
                scanRecordDomainService.insertOrchestrationFailure(
                        o,
                        "ensureShipmentReconciliation",
                        e == null ? "ensureShipmentReconciliation failed"
                                : ("ensureShipmentReconciliation failed: " + e.getMessage()),
                        now);
            }
            touched++;
        }
        return touched;
    }

    private BigDecimal resolveLastUnitPrice(String orderId, String type) {
        if (!StringUtils.hasText(orderId)) {
            return null;
        }
        String oid = orderId.trim();
        String tp = StringUtils.hasText(type) ? type.trim().toLowerCase() : "";

        try {
            if ("shipment".equals(tp)) {
                ShipmentReconciliation sr = shipmentReconciliationService.lambdaQuery()
                        .select(ShipmentReconciliation::getUnitPrice)
                        .eq(ShipmentReconciliation::getOrderId, oid)
                        .orderByDesc(ShipmentReconciliation::getCreateTime)
                        .last("limit 1")
                        .one();
                return sr == null ? null : sr.getUnitPrice();
            }
            return null;
        } catch (Exception e) {
            log.warn("Failed to resolve last unit price: orderId={}, type={}", oid, tp, e);
            return null;
        }
    }

    private String buildFinanceNo(String prefix, LocalDateTime now) {
        LocalDateTime t = now == null ? LocalDateTime.now() : now;
        String p = StringUtils.hasText(prefix) ? prefix.trim().toUpperCase() : "NO";
        String ts = t.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        String rand = String.valueOf((int) (ThreadLocalRandom.current().nextDouble() * 9000) + 1000);
        return p + ts + rand;
    }

    private BigDecimal calculateScanCostForOrder(String orderId) {
        try {
            List<ScanRecord> scans = scanRecordService.list(
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .ne(ScanRecord::getScanType, "orchestration")
                    .eq(ScanRecord::getScanResult, "success")
                    .isNull(ScanRecord::getFactoryId)
            );
            return scans.stream()
                .map(s -> s.getScanCost() != null ? s.getScanCost() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("计算扫码成本失败: orderId={}", orderId, e);
            return BigDecimal.ZERO;
        }
    }

    private static boolean isAllDigits(String s) {
        if (s == null || s.isEmpty()) {
            return false;
        }
        for (int i = 0; i < s.length(); i++) {
            if (!Character.isDigit(s.charAt(i))) {
                return false;
            }
        }
        return true;
    }

    private void triggerPayrollSettlementGeneration(String orderId) {
        try {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        java.util.Map<String, Object> params = new java.util.HashMap<>();
                        params.put("orderId", orderId);
                        payrollSettlementOrchestrator.generate(params);
                        log.info("[计件薪资] 订单 {} 关单成功，已自动生成相关计件工资结算单", orderId);
                    } catch (IllegalStateException e) {
                        log.info("[计件薪资] 订单 {} 无可结算记录，跳过生成工资单 ({})", orderId, e.getMessage());
                    } catch (Exception e) {
                        log.error("[计件薪资] 订单 {} 自动生成工资单失败: {}", orderId, e.getMessage(), e);
                    }
                }
            });
        } catch (Exception e) {
            log.error("[计件薪资] 注册后置任务失败 订单 {}", orderId, e);
        }
    }
}
