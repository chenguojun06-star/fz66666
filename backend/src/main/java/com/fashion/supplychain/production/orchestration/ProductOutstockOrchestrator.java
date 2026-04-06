package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.integration.openapi.service.WebhookPushService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Autowired;
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

    public IPage<ProductOutstock> list(Map<String, Object> params) {
        return productOutstockService.queryPage(params);
    }

    public ProductOutstock getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductOutstock outstock = productOutstockService.getById(key);
        if (outstock == null || (outstock.getDeleteFlag() != null && outstock.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("出库单不存在");
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
        boolean ok = saveAndSync(outstock);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
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
        ProductOutstock outstock = productOutstockService.getById(key);
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

        log.info("出库单已收货: outstockNo={}, id={}", outstock.getOutstockNo(), key);
        return productOutstockService.getById(key);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductOutstock current = productOutstockService.getById(key);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("出库单不存在");
        }

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;

        // 恢复SKU库存（出库时扣减了，删除时要加回来）
        int qty = current.getOutstockQuantity() != null ? current.getOutstockQuantity() : 0;
        if (qty > 0 && StringUtils.hasText(orderId)) {
            ProductionOrder order = productionOrderService.getById(orderId);
            if (order != null) {
                String styleNo = StringUtils.hasText(current.getStyleNo()) ? current.getStyleNo() : order.getStyleNo();
                String color = order.getColor();
                String size = order.getSize();
                if (StringUtils.hasText(styleNo) && StringUtils.hasText(color) && StringUtils.hasText(size)) {
                    String skuCode = String.format("%s-%s-%s", styleNo.trim(), color.trim(), size.trim());
                    productSkuService.updateStock(skuCode, qty);
                    log.info("Restored SKU stock after outstock delete: skuCode={}, qty={}", skuCode, qty);
                }
            }
        }

        boolean ok = productOutstockService.removeById(key);
        if (!ok) {
            throw new IllegalStateException("删除失败");
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
}
