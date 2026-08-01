package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@Lazy
public class IntelligenceScheduledTasks {

    @Autowired private DailyBriefingService dailyBriefingService;
    @Autowired private DeliveryPredictionService deliveryPredictionService;
    @Autowired private RestockSuggestionService restockSuggestionService;
    @Autowired private ProcessStatsEngine processStatsEngine;

    private static final int TOP_N = 20;

    @Scheduled(cron = "0 0 8 * * ?")
    public void generateDailyIntelligence() {
        log.info("【定时任务】开始生成每日智能简报 + 刷新交期风险预测 + 刷新补货建议...");
        List<Long> tenantIds = processStatsEngine.findActiveTenantIds();
        for (Long tenantId : tenantIds) {
            try {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUsername("scheduled-task");
                ctx.setUserId("scheduled-task");
                UserContext.set(ctx);

                try {
                    dailyBriefingService.generate(tenantId);
                } catch (Exception e) {
                    log.error("【定时任务】dailyBriefingService.generate 执行异常 tenantId={}: {}", tenantId, e.getMessage(), e);
                }

                try {
                    deliveryPredictionService.predictRisks(tenantId, TOP_N);
                } catch (Exception e) {
                    log.error("【定时任务】deliveryPredictionService.predictRisks 执行异常 tenantId={}: {}", tenantId, e.getMessage(), e);
                }

                try {
                    restockSuggestionService.getSuggestions(tenantId, TOP_N);
                } catch (Exception e) {
                    log.error("【定时任务】restockSuggestionService.getSuggestions 执行异常 tenantId={}: {}", tenantId, e.getMessage(), e);
                }

                log.info("【定时任务】租户 {} 每日智能任务执行完成", tenantId);
            } catch (Exception e) {
                log.error("【定时任务】generateDailyIntelligence 租户 {} 异常: {}", tenantId, e.getMessage(), e);
            } finally {
                UserContext.clear();
            }
        }
        log.info("【定时任务】所有租户每日智能任务执行完成，共 {} 个租户", tenantIds.size());
    }

    @Scheduled(cron = "0 0 * * * ?")
    public void hourlyHealthCheck() {
        try {
            String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            log.info("【定时任务-健康检查】当前时间: {}, 定时任务服务运行正常", now);
        } catch (Exception e) {
            log.error("【定时任务-健康检查】hourlyHealthCheck 执行异常: {}", e.getMessage(), e);
        }
    }
}
