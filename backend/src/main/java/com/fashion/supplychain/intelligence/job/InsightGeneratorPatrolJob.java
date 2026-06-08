package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
public class InsightGeneratorPatrolJob extends AbstractPatrolJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Scheduled(cron = "0 0 7 * * ?")
    public void dailyMorningReport() {
        log.info("[InsightGenerator] ===== 开始生成每日晨报 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "insight-generator",
                        "洞察生成器：每日晨报");

                long activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .count();

                long overdueOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .count();

                String summary = String.format("每日晨报：活跃订单%d单，逾期%d单。今日重点关注逾期订单的处理进度。",
                        activeOrders, overdueOrders);

                finishAndSnapshot(tenantId, commandId, "insight-generator", "洞察生成器",
                        summary, System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[InsightGenerator] 租户{}生成晨报异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "生成异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[InsightGenerator] ===== 每日晨报生成完成 =====");
    }
}