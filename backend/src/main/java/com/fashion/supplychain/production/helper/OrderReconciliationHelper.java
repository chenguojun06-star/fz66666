package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 订单结算辅助类
 * 用于关单时自动创建订单结算记录（支持本厂和加工厂）
 */
@Component
@Slf4j
public class OrderReconciliationHelper {

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

    public boolean isOwnFactory(ProductionOrder order) {
        if (order == null) {
            return false;
        }
        if (StringUtils.hasText(order.getFactoryType())) {
            return "INTERNAL".equalsIgnoreCase(order.getFactoryType().trim());
        }
        String factoryName = order.getFactoryName();
        if (!StringUtils.hasText(factoryName)) {
            return false;
        }
        String name = factoryName.trim();
        return "本厂".equals(name) || "最美服装工厂".equals(name);
    }

    /**
     * 关单时创建订单结算记录
     * - 本厂订单：汇总扫码工资成本
     * - 加工厂订单：按单价×数量计算
     */
    public void createShipmentReconciliationOnClose(ProductionOrder order) {
        createShipmentReconciliationOnClose(order, false);
    }

    /**
     * 关单时创建订单结算记录（支持特需关单标记）
     * @param specialClose true=特需关单，quantity 为实际合格入库数，remark 自动标注
     */
    @org.springframework.transaction.annotation.Transactional
    public void createShipmentReconciliationOnClose(ProductionOrder order, boolean specialClose) {
        if (order == null) {
            log.warn("订单为空，无法创建结算记录");
            return;
        }

        String orderId = order.getId();
        String orderNo = order.getOrderNo();

        // 检查是否已存在结算记录
        long existingCount = shipmentReconciliationService.count(
            new LambdaQueryWrapper<ShipmentReconciliation>()
                .eq(ShipmentReconciliation::getOrderId, orderId)
        );

        if (existingCount > 0) {
            log.info("订单结算记录已存在，跳过创建: orderId={}, orderNo={}", orderId, orderNo);
            return;
        }

        // 判断是否本厂
        boolean isOwn = isOwnFactory(order);

        // 创建结算记录
        ShipmentReconciliation recon = new ShipmentReconciliation();
        recon.setReconciliationNo(buildReconciliationNo());
        recon.setOrderId(orderId);
        recon.setOrderNo(orderNo);
        recon.setCustomerId(order.getFactoryId());
        recon.setCustomerName(order.getFactoryName());
        recon.setStyleId(order.getStyleId());
        recon.setStyleNo(order.getStyleNo());
        recon.setStyleName(order.getStyleName());
        recon.setQuantity(order.getCompletedQuantity());
        recon.setIsOwnFactory(isOwn ? 1 : 0);

        // 计算扫码工资成本（本厂和加工厂都可能有扫码记录）
        BigDecimal scanCost = calculateScanCostForOrder(orderId);
        recon.setScanCost(scanCost);

        // 计算物料采购成本（从物料采购单汇总）
        BigDecimal materialCost = calculateMaterialCostForOrder(orderId, orderNo);
        recon.setMaterialCost(materialCost);

        // 计算金额
        if (isOwn) {
            // 本厂：只用扫码工资成本
            recon.setTotalAmount(scanCost);
            recon.setFinalAmount(scanCost);
            log.info("本厂订单关单，工资成本: orderId={}, scanCost={}", orderId, scanCost);
        } else {
            // 加工厂：扫码成本 + 加工费
            // 使用 factoryUnitPrice（加工厂单价）计算加工费
            BigDecimal unitPrice = order.getFactoryUnitPrice() != null ? order.getFactoryUnitPrice() : BigDecimal.ZERO;
            BigDecimal quantity = new BigDecimal(order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0);
            BigDecimal processingFee = unitPrice.multiply(quantity);
            BigDecimal totalAmount = scanCost.add(processingFee);

            recon.setUnitPrice(unitPrice);
            recon.setTotalAmount(totalAmount);
            recon.setFinalAmount(totalAmount);
            log.info("加工厂订单关单，扫码成本: {}, 加工费: {}, 总计: {}",
                scanCost, processingFee, totalAmount);
        }

        recon.setStatus("pending");
        recon.setReconciliationDate(LocalDateTime.now());
        if (specialClose) {
            int actualQty = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
            recon.setRemark("特需关单，按实际合格入库数量 " + actualQty + " 件核算");
        }

        boolean saved = shipmentReconciliationService.save(recon);
        if (saved) {
            log.info("订单结算记录创建成功: orderId={}, reconciliationNo={}, isOwnFactory={}",
                orderId, recon.getReconciliationNo(), isOwn);
            // 推送应收账单到 BillAggregation（出货对账单生成后自动应收）
            pushReceivableBill(recon);
        } else {
            log.error("订单结算记录创建失败: orderId={}", orderId);
        }
    }

    /**
     * 推送对账账单到 BillAggregation
     * <p>
     * P0-1 修复：原实现错推 RECEIVABLE+CUSTOMER（外发工厂应付错记为客户应收）
     * 现按工厂类型正确推送：
     * - 本厂订单：不推送账单（本厂工资走 PayrollSettlement 链路，不重复推）
     * - 外发工厂订单：推 PAYABLE+EXTERNAL_FACTORY，对方=工厂
     * - 销售出货（非工厂对账）：推 RECEIVABLE+SHIPMENT，对方=客户
     * <p>
     * 判定逻辑：recon.customerId 实际存的是 factoryId（历史命名问题），
     * 通过 isOwnFactory(recon) 判定方向。
     */
    private void pushReceivableBill(ShipmentReconciliation recon) {
        if (billAggregationOrchestrator == null || recon == null || recon.getFinalAmount() == null
                || recon.getFinalAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        try {
            BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
            req.setSourceId(recon.getId());
            req.setSourceNo(recon.getReconciliationNo());
            req.setOrderId(recon.getOrderId());
            req.setOrderNo(recon.getOrderNo());
            req.setStyleNo(recon.getStyleNo());
            req.setAmount(recon.getFinalAmount());
            req.setSettlementMonth(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM")));

            // 判定对账方向：本厂=不推（工资链路独立处理）；外发工厂=PAYABLE；客户销售=RECEIVABLE
            boolean isOwn = recon.getIsOwnFactory() != null && recon.getIsOwnFactory() == 1;
            if (isOwn) {
                // 本厂订单：扫码工资已走 PayrollSettlement 链路，物料成本走 MaterialReconciliation
                // 关单时不再推送账单，避免重复计入成本
                log.info("[OrderRecon] 本厂订单关单不推账单（工资走PayrollSettlement独立链路）: reconciliationNo={}",
                        recon.getReconciliationNo());
                return;
            }
            // 外发工厂对账 → PAYABLE（应付工厂加工费）
            req.setBillType("PAYABLE");
            req.setBillCategory("EXTERNAL_FACTORY");
            req.setSourceType("SHIPMENT_RECONCILIATION");
            req.setCounterpartyType("FACTORY");
            req.setCounterpartyId(recon.getCustomerId());     // 历史字段名 customerId 实际存 factoryId
            req.setCounterpartyName(recon.getCustomerName()); // 实际存 factoryName

            billAggregationOrchestrator.pushBill(req);
            log.info("[OrderRecon] 推送外发工厂应付账单: reconciliationNo={}, factoryId={}, amount={}",
                    recon.getReconciliationNo(), recon.getCustomerId(), recon.getFinalAmount());
        } catch (Exception e) {
            log.warn("[OrderRecon] 推送对账账单失败: reconciliationNo={}, err={}",
                    recon.getReconciliationNo(), e.getMessage());
        }
    }

    /**
     * 计算订单的扫码工资总成本
     */
    private BigDecimal calculateScanCostForOrder(String orderId) {
        try {
            List<ScanRecord> scans = scanRecordService.list(
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .isNull(ScanRecord::getFactoryId)
                    .ne(ScanRecord::getScanType, "orchestration")
            );

            BigDecimal total = scans.stream()
                .map(s -> s.getScanCost() != null ? s.getScanCost() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

            return total;
        } catch (Exception e) {
            log.error("计算扫码成本失败: orderId={}", orderId, e);
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal calculateMaterialCostForOrder(String orderId, String orderNo) {
        try {
            List<MaterialPurchase> purchases = materialPurchaseService.list(
                new LambdaQueryWrapper<MaterialPurchase>()
                    .and(w -> w.eq(MaterialPurchase::getOrderId, orderId)
                            .or().eq(MaterialPurchase::getOrderNo, orderNo))
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .ne(MaterialPurchase::getStatus, "cancelled")
                    .isNotNull(MaterialPurchase::getTotalAmount)
            );
            BigDecimal total = purchases.stream()
                .map(p -> p.getTotalAmount() != null ? p.getTotalAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            return total;
        } catch (Exception e) {
            log.error("计算物料成本失败: orderId={}, orderNo={}", orderId, orderNo, e);
            return BigDecimal.ZERO;
        }
    }

    /**
     * 生成结算单号
     */
    private String buildReconciliationNo() {
        LocalDateTime now = LocalDateTime.now();
        String ts = now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        String rand = String.valueOf((int) (ThreadLocalRandom.current().nextDouble() * 9000) + 1000);
        return "SR" + ts + rand;
    }
}
