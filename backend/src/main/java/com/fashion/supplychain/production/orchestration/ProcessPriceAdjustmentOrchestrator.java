package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProcessPriceAdjustment;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProcessPriceAdjustmentService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工序单价调整编排器
 *
 * 核心规则：
 *   1. 仅管理员（isTopAdmin）可操作
 *   2. 调整只影响当前订单：更新 ProductionProcessTracking + 未结算 ScanRecord
 *   3. 不回流工序模板（TemplateProcess 不受影响）
 *   4. 所有调整必须填写原因，记录到订单备注
 *   5. 调整后通过 SysNoticeOrchestrator 通知相关人员
 */
@Slf4j
@Service
public class ProcessPriceAdjustmentOrchestrator {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("MM-dd HH:mm");

    @Autowired
    private ProcessPriceAdjustmentService adjustmentService;
    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ProductionProcessTrackingService trackingService;
    @Autowired
    private ScanRecordService scanRecordService;
    @Autowired
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    /**
     * 查询订单的所有工序及当前单价（按工序名分组聚合）
     */
    public List<Map<String, Object>> queryProcessesForOrder(String orderNo) {
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = findOrder(orderNo, tenantId);

        List<ProductionProcessTracking> trackings = trackingService.lambdaQuery()
                .eq(ProductionProcessTracking::getProductionOrderId, order.getId())
                .eq(ProductionProcessTracking::getTenantId, tenantId)
                .orderByAsc(ProductionProcessTracking::getProcessOrder)
                .list();

        // 按 processName 分组，取代表性单价和工序信息
        Map<String, List<ProductionProcessTracking>> grouped = trackings.stream()
                .collect(Collectors.groupingBy(
                        t -> t.getProcessName() != null ? t.getProcessName() : "未知工序",
                        LinkedHashMap::new, Collectors.toList()));

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<ProductionProcessTracking>> entry : grouped.entrySet()) {
            List<ProductionProcessTracking> items = entry.getValue();
            ProductionProcessTracking first = items.get(0);
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("processName", entry.getKey());
            info.put("processCode", first.getProcessCode());
            info.put("unitPrice", first.getUnitPrice() != null ? first.getUnitPrice() : BigDecimal.ZERO);
            info.put("bundleCount", items.size());
            info.put("processOrder", first.getProcessOrder());
            result.add(info);
        }
        return result;
    }

    /**
     * 查询订单的调整历史（最近50条）
     */
    public List<ProcessPriceAdjustment> queryAdjustmentHistory(String orderNo) {
        Long tenantId = UserContext.tenantId();
        return adjustmentService.lambdaQuery()
                .eq(ProcessPriceAdjustment::getOrderNo, orderNo)
                .eq(ProcessPriceAdjustment::getTenantId, tenantId)
                .eq(ProcessPriceAdjustment::getDeleteFlag, 0)
                .orderByDesc(ProcessPriceAdjustment::getAdjustedAt)
                .last("LIMIT 50")
                .list();
    }

    /**
     * 执行工序单价调整
     *
     * @param orderNo     订单号
     * @param processName 工序名称
     * @param newPrice    新单价
     * @param reason      调整原因（必填）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> adjustPrice(String orderNo, String processName,
                                            BigDecimal newPrice, String reason) {
        // 1. 权限校验：仅管理员可操作
        if (!UserContext.isTopAdmin()) {
            throw new IllegalStateException("仅管理员可调整工序单价");
        }
        if (reason == null || reason.trim().isEmpty()) {
            throw new IllegalArgumentException("调整原因不能为空");
        }
        if (newPrice == null || newPrice.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("调整单价不能为负数");
        }

        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String username = UserContext.username();
        ProductionOrder order = findOrder(orderNo, tenantId);

        // 2. 查找该订单该工序的所有跟踪记录
        List<ProductionProcessTracking> trackings = trackingService.lambdaQuery()
                .eq(ProductionProcessTracking::getProductionOrderId, order.getId())
                .eq(ProductionProcessTracking::getProcessName, processName)
                .eq(ProductionProcessTracking::getTenantId, tenantId)
                .list();

        if (trackings.isEmpty()) {
            throw new IllegalArgumentException("未找到工序「" + processName + "」的跟踪记录");
        }

        BigDecimal originalPrice = trackings.get(0).getUnitPrice() != null
                ? trackings.get(0).getUnitPrice() : BigDecimal.ZERO;

        // 3. 记录调整审计日志
        ProcessPriceAdjustment adjustment = new ProcessPriceAdjustment();
        adjustment.setTenantId(tenantId);
        adjustment.setOrderId(order.getId());
        adjustment.setOrderNo(orderNo);
        adjustment.setProcessName(processName);
        adjustment.setProcessCode(trackings.get(0).getProcessCode());
        adjustment.setOriginalPrice(originalPrice);
        adjustment.setAdjustedPrice(newPrice);
        adjustment.setReason(reason.trim());
        adjustment.setAdjustedBy(userId);
        adjustment.setAdjustedByName(username);
        adjustment.setAdjustedAt(LocalDateTime.now());
        adjustment.setDeleteFlag(0);
        adjustmentService.save(adjustment);

        // 4. 更新 ProductionProcessTracking 单价 + 重算结算金额
        int trackingUpdated = 0;
        for (ProductionProcessTracking t : trackings) {
            t.setUnitPrice(newPrice);
            if (t.getQuantity() != null) {
                t.setSettlementAmount(newPrice.multiply(BigDecimal.valueOf(t.getQuantity())));
            }
            trackingService.updateById(t);
            trackingUpdated++;
        }

        // 5. 更新未结算的扫码记录单价 + 重算金额
        List<ScanRecord> scanRecords = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getOrderId, order.getId())
                .eq(ScanRecord::getProcessName, processName)
                .eq(ScanRecord::getTenantId, tenantId)
                .ne(ScanRecord::getScanType, "orchestration")
                .and(w -> w.isNull(ScanRecord::getSettlementStatus)
                        .or().ne(ScanRecord::getSettlementStatus, "settled"))
                .list();

        int scanUpdated = 0;
        for (ScanRecord sr : scanRecords) {
            sr.setUnitPrice(newPrice);
            sr.setProcessUnitPrice(newPrice);
            if (sr.getQuantity() != null) {
                sr.setTotalAmount(newPrice.multiply(BigDecimal.valueOf(sr.getQuantity())));
                sr.setScanCost(newPrice.multiply(BigDecimal.valueOf(sr.getQuantity())));
            }
            scanRecordService.updateById(sr);
            scanUpdated++;
        }

        // 6. 追加订单备注
        String remarkText = String.format("[单价调整 %s] 工序「%s」: ¥%s → ¥%s，原因：%s（操作人：%s）",
                LocalDateTime.now().format(FMT), processName,
                originalPrice, newPrice, reason.trim(), username);
        appendOrderRemark(order, remarkText);

        // 7. 发送通知（非阻塞）
        try {
            sysNoticeOrchestrator.sendAuto(tenantId, order, "price_adjustment");
        } catch (Exception e) {
            log.warn("[PriceAdjust] 通知发送失败 orderNo={}: {}", orderNo, e.getMessage());
        }

        log.info("[PriceAdjust] 调整完成 orderNo={} process={} {} → {} by={} trackingUpdated={} scanUpdated={}",
                orderNo, processName, originalPrice, newPrice, username, trackingUpdated, scanUpdated);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderNo", orderNo);
        result.put("processName", processName);
        result.put("originalPrice", originalPrice);
        result.put("adjustedPrice", newPrice);
        result.put("trackingUpdated", trackingUpdated);
        result.put("scanUpdated", scanUpdated);
        return result;
    }

    // ──────────────────────────────────────────────────────────────
    // 私有方法
    // ──────────────────────────────────────────────────────────────

    private ProductionOrder findOrder(String orderNo, Long tenantId) {
        LambdaQueryWrapper<ProductionOrder> qw = new LambdaQueryWrapper<>();
        qw.eq(ProductionOrder::getOrderNo, orderNo);
        if (tenantId != null) {
            qw.eq(ProductionOrder::getTenantId, tenantId);
        }
        ProductionOrder order = productionOrderService.getOne(qw);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在: " + orderNo);
        }
        return order;
    }

    private void appendOrderRemark(ProductionOrder order, String text) {
        String existing = order.getRemarks() != null ? order.getRemarks() : "";
        String newRemarks = existing.isEmpty() ? text : existing + "\n" + text;
        // 防止备注字段过长
        if (newRemarks.length() > 2000) {
            newRemarks = newRemarks.substring(newRemarks.length() - 2000);
        }
        order.setRemarks(newRemarks);
        productionOrderService.updateById(order);
    }
}
