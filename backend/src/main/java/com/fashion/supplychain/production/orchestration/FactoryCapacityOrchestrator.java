package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工厂产能雷达编排器
 * <p>
 * 功能：按工厂汇总当前进行中的生产订单，输出：订单数、总件数、高风险数、已逾期数
 * 高风险定义：距截止日期 ≤ 7 天 且 生产进度 < 70%
 * 仅返回属于当前租户、非软删除、非已完成的订单
 * </p>
 */
@Service
public class FactoryCapacityOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    /** 高风险预警：距截止日期不超过多少天 */
    private static final int AT_RISK_DAYS = 7;
    /** 高风险预警：进度低于多少 */
    private static final int AT_RISK_PROGRESS = 70;

    @Data
    public static class FactoryCapacityItem {
        private String factoryName;
        private int totalOrders;
        private int totalQuantity;
        private int atRiskCount;
        private int overdueCount;
    }

    /**
     * 查询当前租户的工厂产能分布
     *
     * @return 按工厂分组的产能列表，按订单数降序排列
     */
    public List<FactoryCapacityItem> getFactoryCapacity() {
        Long tenantId = UserContext.tenantId();
        LocalDateTime now = LocalDateTime.now();

        // 查询进行中（非 completed）且未删除的订单
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .ne("status", "completed")
          .eq("delete_flag", 0)
          .isNotNull("factory_name")
          .ne("factory_name", "");

        List<ProductionOrder> orders = productionOrderService.list(qw);

        // 按工厂分组统计
        Map<String, List<ProductionOrder>> grouped = orders.stream()
            .collect(Collectors.groupingBy(o ->
                o.getFactoryName() == null ? "未指定工厂" : o.getFactoryName().trim()
            ));

        List<FactoryCapacityItem> result = new ArrayList<>();
        for (Map.Entry<String, List<ProductionOrder>> entry : grouped.entrySet()) {
            List<ProductionOrder> group = entry.getValue();
            FactoryCapacityItem item = new FactoryCapacityItem();
            item.setFactoryName(entry.getKey());
            item.setTotalOrders(group.size());
            item.setTotalQuantity(group.stream()
                .mapToInt(o -> o.getOrderQuantity() == null ? 0 : o.getOrderQuantity())
                .sum());
            item.setOverdueCount((int) group.stream()
                .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(now))
                .count());
            item.setAtRiskCount((int) group.stream()
                .filter(o -> isAtRisk(o, now))
                .count());
            result.add(item);
        }

        // 按订单数降序排列
        result.sort(Comparator.comparingInt(FactoryCapacityItem::getTotalOrders).reversed());
        return result;
    }

    private boolean isAtRisk(ProductionOrder o, LocalDateTime now) {
        if (o.getPlannedEndDate() == null) return false;
        // 已逾期不再重复计入高风险
        if (o.getPlannedEndDate().isBefore(now)) return false;
        long daysLeft = java.time.temporal.ChronoUnit.DAYS.between(now, o.getPlannedEndDate());
        int progress = o.getProductionProgress() == null ? 0 : o.getProductionProgress();
        return daysLeft <= AT_RISK_DAYS && progress < AT_RISK_PROGRESS;
    }
}
