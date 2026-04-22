package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.agent.tool.CriticEvolutionTool;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import java.util.List;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * AI 自进化定时任务 — 每天凌晨 03:30 自动触发 CriticEvolution（按租户隔离）。
 *
 * <h3>解决的痛点</h3>
 * <p>CriticEvolutionTool 原本只有用户在对话中主动说"让AI自我改进"才会运行，
 * 导致 AI 自我改进功能实际上从未自动执行，所有积累的低反馈数据从未被处理。
 * 此 Job 让 AI 每日凌晨自动分析过去 7 天的低反馈/低健康分执行记录，
 * 提炼改进洞察并写入 Qdrant 向量记忆，使 AI 在下次回答时自动融入改进经验，
 * 实现真正的"越用越聪明"。</p>
 *
 * <h3>执行时序</h3>
 * <ul>
 *   <li>02:00 — AiPatrolJob 质量巡检（检测工具失败率/低采纳率）</li>
 *   <li>02:30 — IntelligenceLearningJob 重算工序时效统计</li>
 *   <li>03:00 — AutonomousAgentJob 挖掘规律</li>
 *   <li>03:10 — OrderLearningRefreshJob 刷新下单学习数据</li>
 *   <li><b>03:30 — AiSelfEvolutionJob 自进化（本任务，最后综合改进）</b></li>
 *   <li>06:30 — XiaoyunDailyInsightJob 生成每日洞察推送</li>
 * </ul>
 */
@Slf4j
@Component
public class AiSelfEvolutionJob {

    @Autowired
    private CriticEvolutionTool criticEvolutionTool;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired
    private DistributedLockService distributedLockService;

    /**
     * 每天 03:30 自动对所有活跃租户执行 Critic 自进化。
     *
     * <p>流程：
     * <ol>
     *   <li>读取近 7 天低反馈场景（avgFeedback &lt; 3.5）</li>
     *   <li>读取低健康分 Crew 会话（healthScore &lt; 60）</li>
     *   <li>有样本 → LLM 提炼 2-3 条改进洞察</li>
     *   <li>写入 Qdrant 向量记忆 + t_agent_evolution_log</li>
     *   <li>无样本 → 状态为 SKIPPED，不消耗 LLM Token</li>
     * </ol>
     */
    @Scheduled(cron = "0 30 3 * * ?")
    public void runAutoEvolutionForAllTenants() {
        String lockValue = distributedLockService.tryLock(
                "job:ai-self-evolution", 30, TimeUnit.MINUTES);
        if (lockValue == null) {
            log.info("[AiSelfEvolutionJob] 未获取到分布式锁，跳过本次执行（其他实例正在运行）");
            return;
        }
        try {
            List<Long> tenantIds = processStatsEngine.findActiveTenantIds();
            log.info("[AiSelfEvolutionJob] ===== 开始 AI 自进化 活跃租户={} =====", tenantIds.size());

            int evolved = 0, skipped = 0, failed = 0;
            for (Long tenantId : tenantIds) {
                // 为每个租户注入独立上下文，避免跨租户数据污染
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUserId("SYSTEM_JOB");
                ctx.setUsername("AI自进化定时任务");
                UserContext.set(ctx);
                try {
                    String resultJson = criticEvolutionTool.execute("{\"days\":7}");
                    // 判断是否有有效样本被处理（EVOLVED=成功进化, SKIPPED=无样本）
                    if (resultJson.contains("\"EVOLVED\"")) {
                        evolved++;
                        log.info("[AiSelfEvolutionJob] 租户{} 自进化完成，洞察已写入向量记忆", tenantId);
                    } else {
                        skipped++;
                        log.debug("[AiSelfEvolutionJob] 租户{} 近7天无低反馈样本，跳过进化", tenantId);
                    }
                } catch (Exception e) {
                    failed++;
                    log.warn("[AiSelfEvolutionJob] 租户{} 自进化失败: {}", tenantId, e.getMessage());
                } finally {
                    UserContext.clear();
                }
            }
            log.info("[AiSelfEvolutionJob] ===== 完成 进化={} 跳过={} 失败={} =====",
                    evolved, skipped, failed);
        } finally {
            distributedLockService.unlock("job:ai-self-evolution", lockValue);
        }
    }
}
