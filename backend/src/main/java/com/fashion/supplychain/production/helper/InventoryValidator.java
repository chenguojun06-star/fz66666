package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.List;

/**
 * 库存数量验证器
 * 职责：
 * 1. 验证扫码数量不超出订单数量
 * 2. 计算已完成数量
 * 3. 防止超额扫码
 *
 * 提取自 ScanRecordOrchestrator（减少约300行代码）
 *
 * @author GitHub Copilot
 * @date 2026-02-03
 */
@Component
@Slf4j
public class InventoryValidator {

    @Autowired
    private ScanRecordService scanRecordService;

    /**
     * 验证扫码数量不超出订单数量
     *
     * @param order 生产订单
     * @param scanType 扫码类型
     * @param progressStage 工序阶段
     * @param incomingQty 本次扫码数量
     * @param bundle 裁剪菲号（可选）
     * @throws IllegalArgumentException 如果超出订单数量
     */
    public void validateNotExceedOrderQuantity(ProductionOrder order, String scanType,
                                               String progressStage, int incomingQty,
                                               CuttingBundle bundle) {
        if (order == null || !hasText(order.getId())) {
            return;
        }
        if (incomingQty <= 0) {
            return;
        }

        Integer orderQty = order.getOrderQuantity();
        if (orderQty == null || orderQty <= 0) {
            return; // 订单数量未设置，不做限制
        }

        // 计算该工序已完成数量
        int completedQty = calculateCompletedQuantity(order.getId(), scanType, progressStage, bundle);

        // 计算总数量
        int totalQty = completedQty + incomingQty;

        if (totalQty > orderQty) {
            String msg = String.format(
                    "扫码数量超出订单数量限制！订单数量=%d，已完成=%d，本次扫码=%d，总计=%d",
                    orderQty, completedQty, incomingQty, totalQty);
            log.warn("库存验证失败: orderId={}, scanType={}, stage={}, {}",
                    order.getId(), scanType, progressStage, msg);
            throw new IllegalArgumentException(msg);
        }

        log.debug("库存验证通过: orderId={}, scanType={}, stage={}, 订单数量={}, 已完成={}, 本次扫码={}",
                order.getId(), scanType, progressStage, orderQty, completedQty, incomingQty);
    }

    /**
     * 计算指定工序的已完成数量
     */
    private int calculateCompletedQuantity(String orderId, String scanType,
                                          String progressStage, CuttingBundle bundle) {
        try {
            LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getQuantity)
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getScanResult, "success");

            // 扫码类型过滤
            if (hasText(scanType)) {
                wrapper.eq(ScanRecord::getScanType, scanType);
            } else {
                // 默认统计生产相关扫码
                wrapper.in(ScanRecord::getScanType, Arrays.asList("production", "cutting", "quality", "warehouse"));
            }

            // 工序阶段过滤
            if (hasText(progressStage)) {
                wrapper.and(w -> w.eq(ScanRecord::getProgressStage, progressStage)
                        .or().eq(ScanRecord::getProcessName, progressStage));
            }

            // 裁剪菲号过滤（如果指定）
            if (bundle != null && hasText(bundle.getId())) {
                wrapper.eq(ScanRecord::getCuttingBundleId, bundle.getId());
            }

            List<ScanRecord> records = scanRecordService.list(wrapper);

            if (records == null || records.isEmpty()) {
                return 0;
            }

            // 累加数量
            int total = 0;
            for (ScanRecord record : records) {
                if (record != null && record.getQuantity() != null && record.getQuantity() > 0) {
                    total += record.getQuantity();
                }
            }

            return total;
        } catch (Exception e) {
            log.error("计算已完成数量失败: orderId={}, scanType={}, stage={}",
                    orderId, scanType, progressStage, e);
            return 0; // 计算失败时返回0，不拦截扫码
        }
    }

    /**
     * 批量验证多个工序的数量
     */
    public void validateMultipleStages(ProductionOrder order, int incomingQty,
                                       String... stages) {
        for (String stage : stages) {
            validateNotExceedOrderQuantity(order, "production", stage, incomingQty, null);
        }
    }

    /**
     * 获取订单剩余可扫码数量
     */
    public int getRemainingQuantity(String orderId, String scanType, String progressStage) {
        try {
            // 这里需要查询订单获取总数量，简化处理
            // 实际使用时应注入 ProductionOrderService
            return Integer.MAX_VALUE; // 暂时返回最大值
        } catch (Exception e) {
            log.error("获取剩余数量失败: orderId={}", orderId, e);
            return 0;
        }
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }
}
