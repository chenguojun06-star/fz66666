package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
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

    /**
     * 判断是否本厂
     * 本厂：factory_name = "本厂" 或 "最美服装工厂"
     */
    public boolean isOwnFactory(ProductionOrder order) {
        if (order == null) {
            return false;
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

        boolean saved = shipmentReconciliationService.save(recon);
        if (saved) {
            log.info("订单结算记录创建成功: orderId={}, reconciliationNo={}, isOwnFactory={}",
                orderId, recon.getReconciliationNo(), isOwn);
        } else {
            log.error("订单结算记录创建失败: orderId={}", orderId);
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
