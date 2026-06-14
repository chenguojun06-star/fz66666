package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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

    private static final Long SYSTEM_TENANT_ID = 1L;
    private static final int TOP_N = 20;

    @Scheduled(cron = "0 0 8 * * ?")
    public void generateDailyIntelligence() {
        log.info("【定时任务】开始生成每日智能简报 + 刷新交期风险预测 + 刷新补货建议...");
        try {
            UserContext systemCtx = new UserContext();
            systemCtx.setTenantId(SYSTEM_TENANT_ID);
            systemCtx.setUsername("scheduled-task");
            systemCtx.setUserId("scheduled-task");
            UserContext.set(systemCtx);

            try {
                dailyBriefingService.generate(SYSTEM_TENANT_ID);
                log.info("【定时任务】DailyBriefingService.generate 执行完成");
            } catch (Exception e) {
                log.error("【定时任务】dailyBriefingService.generate 执行异常: {}", e.getMessage(), e);
            }

            try {
                deliveryPredictionService.predictRisks(SYSTEM_TENANT_ID, TOP_N);
                log.info("【定时任务】DeliveryPredictionService.predictRisks 执行完成");
            } catch (Exception e) {
                log.error("【定时任务】deliveryPredictionService.predictRisks 执行异常: {}", e.getMessage(), e);
            }

            try {
                restockSuggestionService.getSuggestions(SYSTEM_TENANT_ID, TOP_N);
                log.info("【定时任务】RestockSuggestionService.getSuggestions 执行完成");
            } catch (Exception e) {
                log.error("【定时任务】restockSuggestionService.getSuggestions 执行异常: {}", e.getMessage(), e);
            }

            log.info("【定时任务】每日智能任务执行完成");
        } catch (Exception e) {
            log.error("【定时任务】generateDailyIntelligence 顶层异常，不影响后续任务: {}", e.getMessage(), e);
        } finally {
            UserContext.clear();
        }
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
