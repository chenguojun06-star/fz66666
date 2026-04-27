package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.dashboard.orchestration.DailyBriefOrchestrator;
import com.fashion.supplychain.intelligence.entity.XiaoyunDailyInsight;
import com.fashion.supplychain.intelligence.mapper.XiaoyunDailyInsightMapper;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class XiaoyunDailyInsightJob {

    @Autowired private DailyBriefOrchestrator dailyBriefOrchestrator;
    @Autowired private XiaoyunDailyInsightMapper insightMapper;
    @Autowired private ProcessStatsEngine processStatsEngine;
    @Autowired private DistributedLockService distributedLockService;
    @Autowired(required = false) private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Value("${xiaoyun.daily-insight.llm-enabled:true}")
    private boolean llmInsightEnabled;

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
        int ydScan = toInt(brief.get("yesterdayScanCount"));

        String morningContent;
        if (llmInsightEnabled && inferenceOrchestrator != null && inferenceOrchestrator.isAnyModelEnabled()) {
            morningContent = generateLlmInsight(brief, overdue, highRisk, todayScan, ydWh, ydWhQty, ydScan);
        } else {
            morningContent = String.format(
                "昨日入库 %d 单 / %d 件，今日扫码 %d 次；逾期订单 %d，高风险订单 %d。",
                ydWh, ydWhQty, todayScan, overdue, highRisk);
        }

        insertInsight(tenantId, today, "morning_brief", "info",
            "今日运营速览", morningContent, "/intelligence");

        if (overdue >= 3) {
            insertInsight(tenantId, today, "overdue", "high",
                "逾期订单预警",
                "当前有 " + overdue + " 单逾期未完成，请优先跟进。",
                "/production/progress?filter=overdue");
        }

        if (highRisk >= 3) {
            insertInsight(tenantId, today, "highrisk", "warn",
                "高风险订单提醒",
                "有 " + highRisk + " 单 7 天内到期但进度 <50%，建议催工。",
                "/production/progress?filter=highrisk");
        }
    }

    private String generateLlmInsight(Map<String, Object> brief, int overdue, int highRisk,
                                       int todayScan, int ydWh, int ydWhQty, int ydScan) {
        String scanTrend = "";
        if (ydScan > 0 && todayScan > 0) {
            double change = ((double)(todayScan - ydScan) / ydScan) * 100;
            scanTrend = String.format("今日扫码较昨日%s%.0f%%", change >= 0 ? "增长" : "下降", Math.abs(change));
        } else {
            scanTrend = "今日扫码" + todayScan + "次";
        }

        String systemPrompt = "你是服装供应链资深跟单总监，负责为团队生成每日运营洞察。要求：\n"
            + "1. 趋势判断：环比变化超过30%的，必须指出并推测原因\n"
            + "2. 风险关联：逾期订单集中在哪些工厂？这些工厂最近有无异常？\n"
            + "3. 行动建议：具体到'联系XX确认XX进度'，不要空话\n"
            + "4. 优先级排序：最紧急的事排第一\n"
            + "5. 每条洞察必须有数据支撑，不编造\n"
            + "6. 控制在150字以内，简洁有力\n"
            + "7. 不要用'建议关注'等空话，每个建议必须包含具体动作\n";

        String userPrompt = String.format(
            "【昨日数据】入库%d单/%d件，扫码%d次\n"
            + "【今日数据】扫码%d次（%s）\n"
            + "【风险】逾期订单%d，高风险订单%d\n"
            + "【其他指标】%s\n\n"
            + "请生成今日洞察：",
            ydWh, ydWhQty, ydScan,
            todayScan, scanTrend,
            overdue, highRisk,
            brief.get("primaryConcern") != null ? brief.get("primaryConcern") : "无特别标注");

        try {
            IntelligenceInferenceResult result = inferenceOrchestrator.chat("daily_insight", systemPrompt, userPrompt);
            if (result != null && result.isSuccess() && result.getContent() != null && !result.getContent().isBlank()) {
                String content = result.getContent().trim();
                if (content.length() > 500) {
                    content = content.substring(0, 500);
                }
                log.info("[XiaoyunInsightJob] LLM洞察生成成功 ({}字符)", content.length());
                return content;
            }
        } catch (Exception e) {
            log.warn("[XiaoyunInsightJob] LLM洞察生成失败，降级为基础摘要: {}", e.getMessage());
        }
        return String.format("昨日入库 %d 单 / %d 件，今日扫码 %d 次；逾期订单 %d，高风险订单 %d。",
            ydWh, ydWhQty, todayScan, overdue, highRisk);
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
        try { return Integer.parseInt(v.toString()); } catch (Exception ignore) { log.debug("[DailyInsight] toInt解析失败: v={}", v); return 0; }
    }
}
