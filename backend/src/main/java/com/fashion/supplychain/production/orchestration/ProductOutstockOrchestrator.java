package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.ProductOutstockLogAppendHelper;
import com.fashion.supplychain.integration.openapi.service.WebhookPushService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Map;

@Service
@Slf4j
public class ProductOutstockOrchestrator {

    @Autowired
    private ProductOutstockService productOutstockService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired(required = false)
    private WebhookPushService webhookPushService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private ProductOutstockLogAppendHelper logAppendHelper;

    @Lazy
    @Autowired(required = false)
    private com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator billAggregationOrchestrator;

    public IPage<ProductOutstock> list(Map<String, Object> params) {
        // P1 修复（铁律4 多租户隔离）：工厂账号强制隔离，只能查看自己工厂订单的出库单
        Map<String, Object> effectiveParams = params != null ? new HashMap<>(params) : new HashMap<>();
        List<String> factoryOrderIds = DataPermissionHelper.getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null) {
            if (factoryOrderIds.isEmpty()) {
                return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
            }
            // 工厂账号按 orderId 列表过滤
            effectiveParams.put("_factoryOrderIds", factoryOrderIds);
            // 通过 orderNo 列表传给 Service 层过滤（ProductOutstock 表无 orderId 时回退到 orderNo）
            List<String> factoryOrderNos = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getOrderNo)
                            .in(ProductionOrder::getId, factoryOrderIds)
            ).stream().map(ProductionOrder::getOrderNo).filter(StringUtils::hasText).collect(Collectors.toList());
            if (factoryOrderNos.isEmpty()) {
                return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
            }
            effectiveParams.put("_factoryOrderNos", factoryOrderNos);
        }
        return productOutstockService.queryPage(effectiveParams);
    }

    public ProductOutstock getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        Long tenantId = UserContext.tenantId();
        ProductOutstock outstock = productOutstockService.lambdaQuery()
                .eq(ProductOutstock::getId, key)
                .eq(ProductOutstock::getTenantId, tenantId)
                .one();
        if (outstock == null || (outstock.getDeleteFlag() != null && outstock.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("出库单不存在");
        }
        // P1 修复：工厂账号校验出库单归属
        if (DataPermissionHelper.isFactoryAccount() && StringUtils.hasText(outstock.getOrderNo())) {
            String ctxFactoryId = UserContext.factoryId();
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .select(ProductionOrder::getId, ProductionOrder::getFactoryId)
                    .eq(ProductionOrder::getOrderNo, outstock.getOrderNo())
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
            if (order == null || !ctxFactoryId.equals(order.getFactoryId())) {
                throw new NoSuchElementException("出库单不存在");
            }
        }
        return outstock;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(ProductOutstock outstock) {
        if (outstock == null) {
            throw new IllegalArgumentException("参数错误");
        }
        // 显式设置操作人/创建人（防止 MetaObjectHandler 取不到上下文导致默认"系统管理员"）
        if (!StringUtils.hasText(outstock.getOperatorName())) {
            String ctxUserId = UserContext.userId();
            String ctxUsername = UserContext.username();
            outstock.setOperatorId(ctxUserId);
            outstock.setOperatorName(ctxUsername);
            outstock.setCreatorId(ctxUserId);
            outstock.setCreatorName(ctxUsername);
        }
        // 兜底设置 platformCode：若未传，从关联生产订单查询（带 tenant_id 隔离，P0铁律4）
        // 与 FinishedOutstockHelper.outbound 行为保持一致，确保所有出库记录都有平台来源
        if (!StringUtils.hasText(outstock.getPlatformCode()) && StringUtils.hasText(outstock.getOrderNo())) {
            try {
                Long currentTenantId = UserContext.tenantId();
                ProductionOrder prodOrder = productionOrderService.lambdaQuery()
                        .select(ProductionOrder::getId, ProductionOrder::getPlatformCode)
                        .eq(ProductionOrder::getOrderNo, outstock.getOrderNo())
                        .eq(currentTenantId != null, ProductionOrder::getTenantId, currentTenantId)
                        .one();
                if (prodOrder != null && StringUtils.hasText(prodOrder.getPlatformCode())) {
                    outstock.setPlatformCode(prodOrder.getPlatformCode());
                }
            } catch (Exception e) {
                log.warn("[出库保存] 查询生产订单 platformCode 失败: orderNo={} {}", outstock.getOrderNo(), e.getMessage());
            }
        }
        boolean ok = saveAndSync(outstock);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        logAppendHelper.appendCreate(outstock.getId());

        // 异步推送物流信息给已对接客户
        if (webhookPushService != null) {
            try {
                Map<String, Object> details = Map.of(
                    "styleNo", outstock.getStyleNo() != null ? outstock.getStyleNo() : "",
                    "outstockType", outstock.getOutstockType() != null ? outstock.getOutstockType() : ""
                );
                webhookPushService.pushLogisticsUpdate(
                    outstock.getOrderNo(),
                    outstock.getOutstockNo(),
                    outstock.getOutstockQuantity() != null ? outstock.getOutstockQuantity() : 0,
                    "",
                    details
                );
            } catch (Exception e) {
                log.warn("Webhook推送物流信息失败: orderNo={}", outstock.getOrderNo(), e);
            }
        }
        return true;
    }

    private boolean saveAndSync(ProductOutstock outstock) {
        boolean ok = productOutstockService.saveOutstockAndValidate(outstock);
        if (!ok) {
            return false;
        }

        String oid = StringUtils.hasText(outstock.getOrderId()) ? outstock.getOrderId().trim() : null;
        if (StringUtils.hasText(oid)) {
            try {
                ProductionOrder patch = new ProductionOrder();
                patch.setId(oid);
                patch.setUpdateTime(LocalDateTime.now());
                productionOrderService.updateById(patch);
            } catch (Exception e) {
                log.warn("Failed to touch production order after outstock save: orderId={}, outstockId={}",
                        oid,
                        outstock == null ? null : outstock.getId(),
                        e);
            }

            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(oid);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after outstock save: orderId={}, outstockId={}",
                        oid,
                        outstock == null ? null : outstock.getId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        oid,
                        outstock == null ? null : outstock.getOrderNo(),
                        outstock == null ? null : outstock.getStyleId(),
                        outstock == null ? null : outstock.getStyleNo(),
                        "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed" : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }

            try {
                productionOrderOrchestrator.ensureShipmentReconciliationForOrder(oid);
            } catch (Exception e) {
                log.warn("Failed to ensure shipment reconciliation after outstock save: orderId={}, outstockId={}",
                        oid,
                        outstock == null ? null : outstock.getId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        oid,
                        outstock == null ? null : outstock.getOrderNo(),
                        outstock == null ? null : outstock.getStyleId(),
                        outstock == null ? null : outstock.getStyleNo(),
                        "ensureShipmentReconciliation",
                        e == null ? "ensureShipmentReconciliation failed"
                                : ("ensureShipmentReconciliation failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
        }

        return true;
    }

    /**
     * 确认收货 — 外发工厂发货后，内部确认收到货物
     */
    @Transactional(rollbackFor = Exception.class)
    public ProductOutstock receive(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        Long tenantId = UserContext.tenantId();
        ProductOutstock outstock = productOutstockService.lambdaQuery()
                .eq(ProductOutstock::getId, key)
                .eq(ProductOutstock::getTenantId, tenantId)
                .one();
        if (outstock == null || (outstock.getDeleteFlag() != null && outstock.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("出库单不存在");
        }
        if ("received".equals(outstock.getReceiveStatus())) {
            throw new IllegalStateException("该出库单已收货，请勿重复操作");
        }

        ProductOutstock patch = new ProductOutstock();
        patch.setId(key);
        patch.setReceiveStatus("received");
        patch.setReceiveTime(LocalDateTime.now());
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            patch.setReceivedBy(ctx.getUserId() != null ? String.valueOf(ctx.getUserId()) : null);
            patch.setReceivedByName(ctx.getUsername());
        }
        patch.setUpdateTime(LocalDateTime.now());
        productOutstockService.updateById(patch);

        logAppendHelper.appendOutstock(key, outstock.getOutstockQuantity());

        log.info("出库单已收货: outstockNo={}, id={}", outstock.getOutstockNo(), key);
        return productOutstockService.getById(key);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        Long tenantId = UserContext.tenantId();
        ProductOutstock current = productOutstockService.lambdaQuery()
                .eq(ProductOutstock::getId, key)
                .eq(ProductOutstock::getTenantId, tenantId)
                .one();
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("出库单不存在");
        }

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;

        // 恢复SKU库存（出库时扣减了，删除时要加回来）
        int qty = current.getOutstockQuantity() != null ? current.getOutstockQuantity() : 0;
        if (qty > 0 && StringUtils.hasText(orderId)) {
            String styleNo = current.getStyleNo();
            String color = current.getColor();
            String size = current.getSize();
            if (StringUtils.hasText(styleNo) && StringUtils.hasText(color) && StringUtils.hasText(size)) {
                String skuCode = styleNo.trim() + color.trim() + size.trim();
                productSkuService.updateStock(skuCode, qty);
                log.info("Restored SKU stock after outstock delete: skuCode={}, qty={}", skuCode, qty);
            } else {
                log.warn("[出库删除] 出库记录缺少color/size，跳过SKU库存恢复: id={}, styleNo={}, color={}, size={}",
                        current.getId(), styleNo, color, size);
            }
        }

        boolean ok = productOutstockService.removeById(key);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }

        // P1-2 修复：删除出库单时反向 PRODUCT_OUTSTOCK 账单（数据链路闭环）
        // 失败不阻塞主流程（账单可能已结清需人工冲账）
        if (billAggregationOrchestrator != null) {
            try {
                billAggregationOrchestrator.reverseBySource("PRODUCT_OUTSTOCK",
                        key, "出库单删除: " + current.getOutstockNo());
                log.info("[出库删除] 反向账单: outstockId={}", key);
            } catch (Exception e) {
                log.warn("[出库删除] 反向账单失败（不阻塞主流程）: outstockId={}, err={}",
                        key, e.getMessage());
            }
        }

        if (StringUtils.hasText(orderId)) {
            try {
                ProductionOrder orderPatch = new ProductionOrder();
                orderPatch.setId(orderId);
                orderPatch.setUpdateTime(LocalDateTime.now());
                productionOrderService.updateById(orderPatch);
            } catch (Exception e) {
                log.warn("Failed to touch production order after outstock delete: orderId={}, outstockId={}",
                        orderId,
                        key,
                        e);
            }

            try {
                productionOrderOrchestrator.ensureShipmentReconciliationForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure shipment reconciliation after outstock delete: orderId={}, outstockId={}",
                        orderId,
                        key,
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId,
                        current.getOrderNo(),
                        current.getStyleId(),
                        current.getStyleNo(),
                        "ensureShipmentReconciliation",
                        e == null ? "ensureShipmentReconciliation failed"
                                : ("ensureShipmentReconciliation failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
        }
        return true;
    }

    /**
     * 成品出库冲销（对齐 ProductWarehousing 冲销模式）
     * 1. 校验原记录存在 + 未被冲销
     * 2. 恢复 SKU 库存
     * 3. 原记录标记 REVERSED
     * 4. 创建冲销新记录（数量取反/金额取反）
     */
    @Transactional(rollbackFor = Exception.class)
    public ProductOutstock reverse(String id, String reason) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("出库单ID不能为空");
        }
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("冲销原因不能为空");
        }
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String username = UserContext.username();
        LocalDateTime now = LocalDateTime.now();

        ProductOutstock original = productOutstockService.lambdaQuery()
                .eq(ProductOutstock::getId, id.trim())
                .eq(ProductOutstock::getTenantId, tenantId)
                .one();
        if (original == null || (original.getDeleteFlag() != null && original.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("出库单不存在");
        }
        if ("REVERSED".equals(original.getReversalStatus())) {
            throw new IllegalArgumentException("该出库记录已被冲销，不能重复操作");
        }

        int reverseQty = original.getOutstockQuantity() != null ? original.getOutstockQuantity() : 0;
        String orderId = original.getOrderId();
        String skuCode = original.getSkuCode();

        // 1. 恢复 SKU 库存
        if (reverseQty > 0 && StringUtils.hasText(skuCode)) {
            productSkuService.updateStock(skuCode, reverseQty);
            log.info("[出库冲销] 恢复SKU库存: skuCode={}, qty={}", skuCode, reverseQty);
        }

        // 2. 原记录标记 REVERSED
        original.setReversalStatus("REVERSED");
        original.setReversalReason(reason);
        original.setUpdateTime(now);
        productOutstockService.updateById(original);

        // P1-2 修复：出库冲销时反向 PRODUCT_OUTSTOCK 账单（数据链路闭环）
        // 失败不阻塞主流程（账单可能已结清需人工冲账）
        if (billAggregationOrchestrator != null) {
            try {
                billAggregationOrchestrator.reverseBySource("PRODUCT_OUTSTOCK",
                        original.getId(), "出库冲销: " + reason);
                log.info("[出库冲销] 反向账单: originalId={}", original.getId());
            } catch (Exception e) {
                log.warn("[出库冲销] 反向账单失败（不阻塞主流程）: originalId={}, err={}",
                        original.getId(), e.getMessage());
            }
        }

        // 3. 创建冲销新记录
        ProductOutstock reversal = new ProductOutstock();
        String reversalId = java.util.UUID.randomUUID().toString().replace("-", "");
        reversal.setId(reversalId);
        reversal.setOutstockNo("RV" + original.getOutstockNo());
        reversal.setOrderId(original.getOrderId());
        reversal.setOrderNo(original.getOrderNo());
        reversal.setStyleId(original.getStyleId());
        reversal.setStyleNo(original.getStyleNo());
        reversal.setStyleName(original.getStyleName());
        reversal.setOutstockQuantity(reverseQty);
        reversal.setOutstockType("reversal");
        reversal.setSourceType(original.getSourceType());
        reversal.setWarehouse(original.getWarehouse());
        reversal.setWarehouseAreaId(original.getWarehouseAreaId());
        reversal.setWarehouseAreaName(original.getWarehouseAreaName());
        reversal.setSkuCode(skuCode);
        reversal.setColor(original.getColor());
        reversal.setSize(original.getSize());
        reversal.setCostPrice(original.getCostPrice());
        reversal.setSalesPrice(original.getSalesPrice());
        reversal.setTotalAmount(original.getTotalAmount() != null ? original.getTotalAmount().negate() : null);
        reversal.setPaidAmount(java.math.BigDecimal.ZERO);
        reversal.setPaymentStatus("reversed");
        reversal.setCustomerName(original.getCustomerName());
        reversal.setCustomerPhone(original.getCustomerPhone());
        reversal.setShippingAddress(original.getShippingAddress());
        reversal.setReversalId(original.getId());
        reversal.setReversalStatus("NONE");
        reversal.setReversalReason(reason);
        reversal.setRemark("冲销出库: " + reason);
        reversal.setCreateTime(now);
        reversal.setUpdateTime(now);
        reversal.setDeleteFlag(0);
        reversal.setTenantId(tenantId);
        productOutstockService.save(reversal);

        // 4. 回填原记录的 reversedById
        original.setReversedById(reversalId);
        original.setUpdateTime(now);
        productOutstockService.updateById(original);

        // 5. 记录操作日志
        try {
            logAppendHelper.appendOperation(reversalId, "出库冲销",
                    "原出库单号:" + original.getOutstockNo() + " 冲销数量:" + reverseQty + " 原因:" + reason);
        } catch (Exception e) {
            log.warn("[出库冲销] 记录日志失败: reversalId={}", reversalId, e);
        }

        log.info("[出库冲销] 完成: originalId={}, reversalId={}, qty={}, reason={}",
                original.getId(), reversalId, reverseQty, reason);
        return reversal;
    }
}
