package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 订单健康度评分编排器（纯计算，无 DB 写操作）
 *
 * 三维度加权（总 100 分）：
 *   - 生产进度      40 分：productionProgress × 0.40
 *   - 交期健康      35 分：按剩余天数分档
 *   - 物料采购完成  25 分：procurementCompletionRate × 0.25
 *
 * 分档：≥75 good（绿）/ 50-74 warn（橙）/ <50 danger（红）
 */
@Slf4j
@Service
public class OrderHealthScoreOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    // ─────────────────────────────────────────────────────────────────────
    // 公开接口
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 批量计算订单健康分
     *
     * @param orderIds 订单主键列表（最多 200 个）
     * @return 每条包含 orderId / score / level / hint
     */
    public List<Map<String, Object>> batchScores(List<String> orderIds) {
        if (orderIds == null || orderIds.isEmpty()) return Collections.emptyList();
        Long tenantId = UserContext.tenantId();

        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .in(ProductionOrder::getId, orderIds)
                .eq(ProductionOrder::getTenantId, tenantId)
                .list();

        Map<String, ProductionOrder> byId = new HashMap<>();
        for (ProductionOrder o : orders) byId.put(String.valueOf(o.getId()), o);

        List<Map<String, Object>> result = new ArrayList<>(orderIds.size());
        for (String id : orderIds) {
            ProductionOrder o = byId.get(id);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("orderId", id);
            if (o != null) {
                int score = calcScore(o);
                item.put("score", score);
                item.put("level", scoreToLevel(score));
                item.put("hint", buildHint(score, o));
            } else {
                item.put("score", -1);
                item.put("level", "unknown");
                item.put("hint", "");
            }
            result.add(item);
        }
        return result;
    }

    /**
     * 计算单个订单健康分（0-100）
     */
    public int calcScore(ProductionOrder order) {
        int score = 0;

        // ① 生产进度 40 分
        int progress = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
        score += Math.round(progress * 0.40f);

        // ② 交期健康 35 分
        if (order.getExpectedShipDate() != null) {
            long days = ChronoUnit.DAYS.between(LocalDate.now(), order.getExpectedShipDate());
            if (days > 14)     score += 35;
            else if (days > 7) score += 26;
            else if (days > 3) score += 16;
            else if (days > 0) score += 8;
            // 逾期 → 0 分
        } else {
            score += 20; // 无交期：给中等分
        }

        // ③ 物料采购完成率 25 分
        Integer proc = order.getProcurementCompletionRate();
        if (proc != null) {
            score += Math.round(proc * 0.25f);
        } else {
            score += 18; // 无数据：给中等分
        }

        return Math.max(0, Math.min(100, score));
    }

    public String scoreToLevel(int score) {
        if (score >= 75) return "good";
        if (score >= 50) return "warn";
        return "danger";
    }

    // ─────────────────────────────────────────────────────────────────────
    // 私有辅助
    // ─────────────────────────────────────────────────────────────────────

    private String buildHint(int score, ProductionOrder order) {
        if (score >= 75) return "进度良好";
        int progress = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
        if (order.getExpectedShipDate() != null) {
            long days = ChronoUnit.DAYS.between(LocalDate.now(), order.getExpectedShipDate());
            if (days <= 0) return "已逾期";
            if (days <= 3) return "交期极度紧迫";
        }
        if (progress < 30) return "进度严重落后";
        return "需关注";
    }
}
