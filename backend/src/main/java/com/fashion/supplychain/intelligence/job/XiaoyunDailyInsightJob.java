package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.dashboard.orchestration.DailyBriefOrchestrator;
import com.fashion.supplychain.intelligence.entity.XiaoyunDailyInsight;
import com.fashion.supplychain.intelligence.mapper.XiaoyunDailyInsightMapper;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 小云每日洞察定时任务（feature B 主动洞察推送 + J 异常自动建单）。
 * 每天早上 6:30 执行，为每个活跃租户生成洞察卡：
 *   · morning_brief（info）：昨日入库/今日扫码/逾期订单总结
 *   · overdue（high）：逾期订单≥3时自动提醒（预留 autoTodoId 联动 Todo 模块）
 *   · highrisk（warn）：高风险订单≥3时提醒
 * 数据写入 t_xiaoyun_daily_insight，前端小云助手按 tenant_id + insight_date 拉取。
 */
@Slf4j
@Component
public class XiaoyunDailyInsightJob {

    @Autowired private DailyBriefOrchestrator dailyBriefOrchestrator;
    @Autowired private XiaoyunDailyInsightMapper insightMapper;
    @Autowired private ProcessStatsEngine processStatsEngine;
    @Autowired private DistributedLockService distributedLockService;

    @Scheduled(cron = "0 30 6 * * ?")
    public void generateDailyInsights() {
        String lockValue = distributedLockService.tryLock("job:xiaoyun-daily-insight", 20, TimeUnit.MINUTES);
        if (lockValue == null) {
            log.info("[XiaoyunInsightJob] 未获取到锁，跳过本次执行");
            return;
        }
        try {
            List<Long> tenantIds = processStatsEngine.findActiveTenantIds();
            log.info("[XiaoyunInsightJob] 开始生成每日洞察，活跃租户数={}", tenantIds.size());
            int success = 0, failed = 0;
            LocalDate today = LocalDate.now();
            for (Long tenantId : tenantIds) {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUserId("SYSTEM_JOB");
                ctx.setUsername("小云每日洞察");
                UserContext.set(ctx);
                try {
                    generateForTenant(tenantId, today);
                    success++;
                } catch (Exception e) {
                    failed++;
                    log.warn("[XiaoyunInsightJob] 租户{} 生成失败: {}", tenantId, e.getMessage());
                } finally {
                    UserContext.clear();
                }
            }
            log.info("[XiaoyunInsightJob] 生成完成 成功={} 失败={}", success, failed);
        } finally {
            distributedLockService.unlock("job:xiaoyun-daily-insight", lockValue);
        }
    }

    private void generateForTenant(Long tenantId, LocalDate today) {
        Map<String, Object> brief = dailyBriefOrchestrator.getBrief();
        int overdue = toInt(brief.get("overdueOrderCount"));
        int highRisk = toInt(brief.get("highRiskOrderCount"));
        int todayScan = toInt(brief.get("todayScanCount"));
        int ydWh = toInt(brief.get("yesterdayWarehousingCount"));
        int ydWhQty = toInt(brief.get("yesterdayWarehousingQuantity"));

        // ① morning_brief（info）
        String morningContent = String.format(
            "昨日入库 %d 单 / %d 件，今日扫码 %d 次；逾期订单 %d，高风险订单 %d。",
            ydWh, ydWhQty, todayScan, overdue, highRisk);
        insertInsight(tenantId, today, "morning_brief", "info",
            "今日运营速览", morningContent, "/intelligence");

        // ② overdue（high）
        if (overdue >= 3) {
            insertInsight(tenantId, today, "overdue", "high",
                "逾期订单预警",
                "当前有 " + overdue + " 单逾期未完成，请优先跟进。",
                "/production/progress?filter=overdue");
        }

        // ③ highrisk（warn）
        if (highRisk >= 3) {
            insertInsight(tenantId, today, "highrisk", "warn",
                "高风险订单提醒",
                "有 " + highRisk + " 单 7 天内到期但进度 <50%，建议催工。",
                "/production/progress?filter=highrisk");
        }
    }

    private void insertInsight(Long tenantId, LocalDate date, String scene,
                               String severity, String title, String content, String actionUrl) {
        XiaoyunDailyInsight row = new XiaoyunDailyInsight();
        row.setId(UUID.randomUUID().toString().replace("-", ""));
        row.setTenantId(tenantId);
        row.setInsightDate(date);
        row.setScene(scene);
        row.setSeverity(severity);
        row.setTitle(title);
        row.setContent(content);
        row.setActionUrl(actionUrl);
        row.setReadFlag(0);
        row.setDismissed(0);
        row.setCreatedAt(LocalDateTime.now());
        insightMapper.insert(row);
    }

    private int toInt(Object v) {
        if (v instanceof Number) return ((Number) v).intValue();
        if (v == null) return 0;
        try { return Integer.parseInt(v.toString()); } catch (Exception ignore) { return 0; }
    }
}
