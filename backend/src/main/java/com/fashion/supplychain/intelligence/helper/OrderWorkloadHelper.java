package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.production.entity.ProductionOrder;

/**
 * 订单在手工作量口径统一 Helper（无状态）。
 *
 * <p>2026-10-09 数据口径修复背景（详见 memory-bank/decisionLog.md）：
 * <ul>
 *   <li>此前各处"在手量"口径不一：有的取 order_quantity 总数（把已完成未关单的订单也算成在手，
 *       导致"逾期27天建议转单"的误报），有的取 order_quantity - completed_quantity
 *       （completed_quantity 与实际进度不同步，progress=80% 时 completed 仍为 0）。</li>
 *   <li>统一为：优先按 production_progress 计算剩余量；progress 缺失时才回退到 completed_quantity。</li>
 *   <li>progress >= 100 视为"已完成待关单"，不再占用产能、不计入在手负载、不参与缺口预警。</li>
 * </ul>
 */
public final class OrderWorkloadHelper {

    private OrderWorkloadHelper() {
    }

    /** 是否"已完成待关单"（进度100%但订单状态尚未流转到 completed/closed） */
    public static boolean isCompletedPendingClosure(ProductionOrder order) {
        if (order == null) return false;
        Integer progress = order.getProductionProgress();
        return progress != null && progress >= 100;
    }

    /**
     * 订单剩余待生产件数。
     *
     * <p>优先用 production_progress 推算（与前端进度展示一致）；
     * progress 缺失/非法时回退 order_quantity - completed_quantity。
     */
    public static int remainingQuantity(ProductionOrder order) {
        if (order == null) return 0;
        int total = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        Integer progress = order.getProductionProgress();
        if (progress != null && progress >= 0 && progress < 100) {
            return (int) Math.max(0, Math.round(total * (100 - progress) / 100.0));
        }
        if (progress != null && progress >= 100) {
            return 0;
        }
        int completed = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
        return Math.max(0, total - completed);
    }
}
