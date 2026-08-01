package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.intelligence.engine.risk.AutoRemediationExecutor;
import com.fashion.supplychain.intelligence.engine.risk.AutoRemediationPolicy;
import com.fashion.supplychain.intelligence.engine.risk.ParallelRiskDetector;
import com.fashion.supplychain.intelligence.engine.risk.RiskDetectionResult;
import com.fashion.supplychain.intelligence.engine.risk.RiskItem;
import com.fashion.supplychain.intelligence.engine.risk.RiskType;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;
import java.util.Map;

/**
 * 自愈引擎巡检任务
 *
 * 每30分钟执行一次：
 * 1. 调用 ParallelRiskDetector 并行检测7类风险
 * 2. 按 AutoRemediationPolicy 策略分流（AUTO / SUGGESTION）
 * 3. AUTO类型：立即调用 AutoRemediationExecutor 执行修复
 * 4. SUGGESTION类型：创建 NEED_APPROVAL 工单，等待人员审批
 *
 * 闭环保证：所有AI执行的动作都创建巡检工单，人员可在工单中心撤销/反馈/手动执行
 */
@Slf4j
@Component
@Lazy
public class SelfHealingPatrolJob extends AbstractPatrolJob {

    private final ParallelRiskDetector riskDetector;
    private final AutoRemediationExecutor remediationExecutor;
    private final AutoRemediationPolicy policy;

    public SelfHealingPatrolJob(ParallelRiskDetector riskDetector,
                                 AutoRemediationExecutor remediationExecutor,
                                 AutoRemediationPolicy policy) {
        this.riskDetector = riskDetector;
        this.remediationExecutor = remediationExecutor;
        this.policy = policy;
    }

    @Scheduled(cron = "0 */30 * * * ?")
    public void patrol() {
        log.info("[SelfHealing] ===== 开始自愈引擎巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        int totalRisks = 0;
        int autoExecuted = 0;
        int suggestions = 0;

        for (Long tenantId : tenants) {
            if (!isPatrolEnabledForTenant(tenantId)) {
                log.debug("[SelfHealing] 租户{}巡检开关未开启，跳过", tenantId);
                continue;
            }

            long start = System.currentTimeMillis();
            String commandId = null;
            // per-tenant 计数（int[] 用于 lambda 内可变）
            final int[] tenantCounts = {0, 0, 0}; // [total, auto, suggestion]

            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "self-healing",
                        "自愈引擎：风险检测+自动修复");

                withTenantContext(tenantId, () -> {
                    // 1. 并行检测所有风险 → 合并排序 → 去重
                    Map<RiskType, List<RiskItem>> byType = riskDetector.detectAll(tenantId);
                    List<RiskItem> ranked = riskDetector.mergeAndRank(byType);
                    List<RiskItem> deduped = riskDetector.deduplicate(ranked);
                    RiskDetectionResult result = RiskDetectionResult.build(byType, ranked, deduped, 0);
                    List<RiskItem> risks = result.getDeduped();

                    log.info("[SelfHealing] 租户{}检测到{}条风险（HIGH+={}条）",
                            tenantId, risks.size(), result.getHighCount());

                    // 2. 按策略处理每条风险
                    for (RiskItem risk : risks) {
                        AutoRemediationPolicy.RemediationMode mode = policy.getMode(risk.getType().name());
                        AiPatrolAction action = remediationExecutor.handleRiskItem(tenantId, risk);

                        if (action != null) {
                            if (mode == AutoRemediationPolicy.RemediationMode.AUTO) {
                                // AUTO模式：立即执行修复
                                remediationExecutor.executeAutoAction(tenantId, action);
                                tenantCounts[1]++;
                            } else {
                                tenantCounts[2]++;
                            }
                            tenantCounts[0]++;
                        }
                    }
                });

                totalRisks += tenantCounts[0];
                autoExecuted += tenantCounts[1];
                suggestions += tenantCounts[2];

                String summary = String.format("检测%d条风险，自动修复%d条，建议%d条",
                        tenantCounts[0], tenantCounts[1], tenantCounts[2]);

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "auto_remediation",
                        summary, System.currentTimeMillis() - start, true);

                finishAndSnapshot(tenantId, commandId, "self-healing", "自愈引擎",
                        summary, System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SelfHealing] 租户{}自愈诊断异常: {}", tenantId, e.getMessage(), e);
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "诊断异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SelfHealing] ===== 自愈引擎巡检完成: 总风险={}, 自动修复={}, 建议={} =====",
                totalRisks, autoExecuted, suggestions);
    }
}
