package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.production.orchestration.FactoryCapacityOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
@Slf4j
public class AiSandboxOrchestrator {

    @Autowired
    private FactoryCapacityOrchestrator factoryCapacityOrchestrator;


    /**
     * 沙盘推演：给定一个假设的新增数量，预估最合适的接单工厂以及完成所需天数。
     */
    public String simulateNewOrder(int quantity) {
        log.info("[AiSandbox] 开始推演假设订单，数量: {}", quantity);
        List<FactoryCapacityOrchestrator.FactoryCapacityItem> capacities = factoryCapacityOrchestrator.getFactoryCapacity();

        if (capacities == null || capacities.isEmpty()) {
            return "{\"error\": \"系统中当前没有活跃的工厂产能数据，无法进行推演。\"}";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("========= 产能沙盘推演报告 =========\n");
        sb.append("模拟接单量: ").append(quantity).append(" 件\n\n");

        // 挑选一个能最快完成的（即空闲产能大，日均产量高的）
        List<FactoryCapacityOrchestrator.FactoryCapacityItem> validFactories = capacities.stream()
                .filter(c -> c.getAvgDailyOutput() > 0)
                .collect(Collectors.toList());

        if (validFactories.isEmpty()) {
            sb.append("当前所有工厂近30天均无产能产出记录，预测天数失效，只能依赖管理经验排单。\n");
            return sb.toString();
        }

        for (FactoryCapacityOrchestrator.FactoryCapacityItem c : validFactories) {
            double currentDaily = c.getAvgDailyOutput();
            int currentBacklog = c.getTotalQuantity();
            int newBacklog = currentBacklog + quantity;
            int newEstimatedDays = (int) Math.ceil(newBacklog / currentDaily);

            sb.append(String.format("【工厂】%s\n", c.getFactoryName()));
            sb.append(String.format("  - 当前日产: %.1f 件/天 | 活跃工人: %d 人\n", currentDaily, c.getActiveWorkers()));
            sb.append(String.format("  - 现有在制: %d 件 | 原预计清空需: %d 天\n", currentBacklog, c.getEstimatedCompletionDays()));
            sb.append(String.format("  - 💥 如果分给该厂: 积压变 %d 件，预计耗时变 %d 天（+%d 天）\n",
                                    newBacklog, newEstimatedDays, newEstimatedDays - Math.max(0, c.getEstimatedCompletionDays())));
            sb.append("\n");
        }
        sb.append("【智能建议】\n");
        sb.append("请将新订单分配给增加后所需天数最短的工厂，或者拆单以保证货期。");

        return sb.toString();
    }
}
