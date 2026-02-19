package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
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
 * 1. 验证扫码数量不超出裁剪数量（以所有菲号的裁剪数量总和为准）
 * 2. 计算已完成数量
 * 3. 防止超额扫码
 *
 * 提取自 ScanRecordOrchestrator（减少约300行代码）
 */
@Component
@Slf4j
public class InventoryValidator {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    /**
     * 验证扫码数量不超出裁剪数量
     *
     * @param order 生产订单
     * @param scanType 扫码类型
     * @param progressStage 工序阶段
     * @param incomingQty 本次扫码数量
     * @param bundle 裁剪菲号（可选）
     * @throws IllegalArgumentException 如果超出裁剪数量
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

        // ★ 使用裁剪数量作为验证基准（所有菲号的裁剪数量总和）
        int cuttingQty = calculateTotalCuttingQuantity(order.getId());
        if (cuttingQty <= 0) {
            // 如果没有裁剪数量，回退到订单数量
            Integer orderQty = order.getOrderQuantity();
            if (orderQty == null || orderQty <= 0) {
                return; // 都没有设置，不做限制
            }
            cuttingQty = orderQty;
        }

        // 计算该工序已完成数量
        int completedQty = calculateCompletedQuantity(order.getId(), scanType, progressStage, bundle);

        // 计算总数量
        int totalQty = completedQty + incomingQty;

        if (totalQty > cuttingQty) {
            String msg = String.format(
                    "扫码数量超出裁剪数量限制！裁剪数量=%d，已完成=%d，本次扫码=%d，总计=%d",
                    cuttingQty, completedQty, incomingQty, totalQty);
            log.warn("库存验证失败: orderId={}, scanType={}, stage={}, {}",
                    order.getId(), scanType, progressStage, msg);
            throw new IllegalArgumentException(msg);
        }

        log.debug("库存验证通过: orderId={}, scanType={}, stage={}, 裁剪数量={}, 已完成={}, 本次扫码={}",
                order.getId(), scanType, progressStage, cuttingQty, completedQty, incomingQty);
    }

    /**
     * ★ 计算订单的总裁剪数量（所有菲号的quantity之和）
     */
    private int calculateTotalCuttingQuantity(String orderId) {
        try {
            List<CuttingBundle> bundles = cuttingBundleService.lambdaQuery()
                    .select(CuttingBundle::getQuantity)
                    .eq(CuttingBundle::getProductionOrderId, orderId)
                    .list();

            if (bundles == null || bundles.isEmpty()) {
                log.debug("订单没有裁剪菲号: orderId={}", orderId);
                return 0;
            }

            int total = bundles.stream()
                    .mapToInt(b -> b.getQuantity() != null ? b.getQuantity() : 0)
                    .sum();

            log.debug("计算裁剪总量: orderId={}, bundleCount={}, totalQty={}",
                    orderId, bundles.size(), total);
            return total;
        } catch (Exception e) {
            log.error("计算裁剪总量失败: orderId={}", orderId, e);
            return 0;
        }
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
