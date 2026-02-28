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
        /** 这年内货期完成率 0-100，-1 表示这年内无完工记录 */
        private int deliveryOnTimeRate;
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

        // 查询这年内完工订单，计算货期完成率
        LocalDateTime yearAgo = now.minusDays(365);
        QueryWrapper<ProductionOrder> doneQw = new QueryWrapper<>();
        doneQw.eq("tenant_id", tenantId)
              .eq("status", "completed")
              .eq("delete_flag", 0)
              .isNotNull("factory_name")
              .ne("factory_name", "")
              .isNotNull("actual_end_date")
              .isNotNull("planned_end_date")
              .ge("actual_end_date", yearAgo);
        List<ProductionOrder> completedOrders = productionOrderService.list(doneQw);
        // 按工厂分组，计算 actualEndDate <= plannedEndDate 的比例
        Map<String, long[]> onTimeStats = new HashMap<>(); // key=factoryName, [0]=总数 [1]=按时数
        for (ProductionOrder o : completedOrders) {
            String fn = o.getFactoryName().trim();
            onTimeStats.computeIfAbsent(fn, k -> new long[]{0, 0});
            onTimeStats.get(fn)[0]++;
            if (!o.getActualEndDate().isAfter(o.getPlannedEndDate())) {
                onTimeStats.get(fn)[1]++;
            }
        }

        // 按订单数降序排列
        result.sort(Comparator.comparingInt(FactoryCapacityItem::getTotalOrders).reversed());

        // 回填货期完成率
        for (FactoryCapacityItem item : result) {
            long[] stats = onTimeStats.get(item.getFactoryName());
            if (stats == null || stats[0] == 0) {
                item.setDeliveryOnTimeRate(-1);
            } else {
                item.setDeliveryOnTimeRate((int) Math.round(stats[1] * 100.0 / stats[0]));
            }
        }
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
