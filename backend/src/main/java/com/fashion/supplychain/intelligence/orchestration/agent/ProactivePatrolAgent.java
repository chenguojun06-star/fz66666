package com.fashion.supplychain.intelligence.orchestration.agent;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.intelligence.dto.SmartNotification;
import com.fashion.supplychain.intelligence.service.ProactiveInsightService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.common.lock.DistributedLockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
public class ProactivePatrolAgent {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MultiAgentDebateOrchestrator debateOrchestrator;

    @Autowired
    private com.fashion.supplychain.intelligence.service.WxAlertNotifyService wxAlertNotifyService;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator traceOrchestrator;

    @Autowired
    private ObjectProvider<ProactiveInsightService> proactiveInsightServiceProvider;

    /**
     * D-702：巡检会诊去重用的 Redis（{@code required=false}，Redis 不可用时退化为「不去重」，
     * 即回到旧行为，不会因去重组件故障导致巡检停摆）。
     */
    @Autowired(required = false)
    private org.springframework.data.redis.core.StringRedisTemplate patrolDedupRedis;

    /**
     * D-702：同一订单「状态未变」时的去重窗口（小时）。
     *
     * <p><b>为什么必须去重</b>（生产实测）：
     * <pre>
     *   巡检 4 个部门 agent（pmc/qc/finance/ceo）= 今日 35.9 万 tokens
     *   占全部 AI 消耗的 95%，而 t_ai_decision_card 近 7 天只新增 2 条
     * </pre>
     * 根因：{@code isAtRisk} 只看<b>当前</b>的 plannedEndDate 与 productionProgress，
     * <b>不与上次诊断结果比较</b>。已逾期订单（{@code daysToDeadline < 0}）会<b>永远</b>返回 true，
     * 于是每 6 小时对同一批订单重跑一次 4 路多智能体辩论 ——
     * 同样输入必然得到同样结论，纯重复消耗；且订单越多越贵（此处无 LIMIT 上限）。
     *
     * <p><b>为什么用「状态指纹」而非单纯时间窗</b>：单纯 24h 跳过会让
     * 「状态明显恶化」的订单也漏掉。指纹取 {@code 进度档位 + 距截止天数档位}，
     * 状态一变指纹就变 → 自动重新会诊，<b>不损失发现能力</b>，
     * 只是不再对同一个问题反复重判。
     */
    @Value("${ai.proactive-patrol.dedup-hours:24}")
    private int patrolDedupHours;

    /**
     * D-700：由「每小时」降为「每 6 小时」。
     *
     * <p>为什么降：这是一次供应链<b>全局主动巡检</b>，每次执行对<b>每个活跃租户</b>都要
     * 拉起 4 个部门 agent（pmc / finance / qc / ceo，见 MultiAgentDebateOrchestrator），
     * 即单次执行 = 4 × 租户数次 LLM 往返。原 cron {@code 0 5 * * * ?} 是<b>每小时</b>，
     * 意味着 24 × 4 = 96 次部门级调用/天/租户，而这些结论只有被消费时才产生价值。
     * 实测当天 t_intelligence_metrics 里 ceo/finance/qc/pmc-agent 各 51 次、跨 17 小时，
     * 全部命中关键词兜底（avg response 仅 15 字符、avg latency 约 130ms）——
     * 即<b>绝大多数是空转</b>：既没拿到有效结论，又把调用量打上去了。
     *
     * <p>改动的取舍：降频会减少「异常发现」的时效性（原来最迟 1 小时发现，现在 6 小时）。
     * 这是刻意的产品决策 —— 目前该巡检的产出本就没被消费，先把频率对齐到消费能力。
     *
     * <p>可调：环境变量 {@code AI_PROACTIVE_PATROL_CRON}（Spring cron 表达式）。
     * 如需临时恢复每小时，设 {@code AI_PROACTIVE_PATROL_CRON=0 5 * * * ?} 即可，无需改代码。
     */
    @Scheduled(cron = "${ai.proactive-patrol.cron:0 5 0/6 * * ?}")
    public void runPatrolTask() {
        if (distributedLockService != null) {
            String lockValue = distributedLockService.tryLock("job:proactive-patrol", 50, TimeUnit.MINUTES);
            if (lockValue == null) {
                log.debug("[ProactivePatrol] 其他实例正在执行，跳过");
                return;
            }
            try {
                doPatrol();
            } finally {
                distributedLockService.unlock("job:proactive-patrol", lockValue);
            }
        } else {
            doPatrol();
        }
    }

    private void doPatrol() {
        log.info("[ProactivePatrol] 启动供应链全局主动巡检...");

        // 修复 P0：原硬编码 "IN_PRODUCTION" 不存在（系统使用 "in_progress"），
        // 改为排除终态，覆盖所有活跃状态（pending/in_progress/production/cutting/sewing/...）
        List<ProductionOrder> activeOrders = productionOrderService.lambdaQuery()
                .notIn(ProductionOrder::getStatus, OrderStatusConstants.TERMINAL_STATUSES)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .list();

        if (activeOrders == null || activeOrders.isEmpty()) {
            log.info("[ProactivePatrol] 无活跃订单，跳过");
            return;
        }

        java.util.Map<Long, List<ProductionOrder>> byTenant = new java.util.LinkedHashMap<>();
        for (ProductionOrder o : activeOrders) {
            byTenant.computeIfAbsent(o.getTenantId(), k -> new java.util.ArrayList<>()).add(o);
        }

        int totalDiagnosed = 0;
        for (java.util.Map.Entry<Long, List<ProductionOrder>> entry : byTenant.entrySet()) {
            Long tenantId = entry.getKey();
            List<ProductionOrder> tenantOrders = entry.getValue();
            UserContext ctx = new UserContext();
            ctx.setTenantId(tenantId);
            ctx.setUserId("SYSTEM");
            UserContext.set(ctx);
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "proactive-patrol",
                        "主动巡检Agent：高危订单多智能体会诊");
                int diagnosed = 0;
                for (ProductionOrder order : tenantOrders) {
                    try {
                        String context = buildOrderGlobalContext(order);
if (isAtRisk(order, context)) {
                              // D-702：状态指纹去重 —— 同一订单状态未变则不重复会诊。
                              // 见 patrolDedupHours 字段注释（巡检占今日 95% token 的根因）。
                              if (shouldSkipDuplicatedDiagnosis(tenantId, order)) {
                                  log.debug("[ProactivePatrol] 订单 {} 状态未变且已在去重窗口内诊断过，跳过重复会诊",
                                          order.getOrderNo());
                                  continue;
                              }
                              log.info("[ProactivePatrol] 发现高危订单: {}, 移交多智能体进行会诊", order.getOrderNo());
                            SmartNotification notification = debateOrchestrator.diagnoseOrderWithMultiAgent(order, context);
                            diagnosed++;
                            // 记录主动洞察，让用户在AI助手中能看到
                            recordRiskInsight(tenantId, order, context);
                        }
                    } catch (Exception e) {
                        log.error("[ProactivePatrol] 巡检订单 {} 时发生异常", order.getOrderNo(), e);
                    }
                }
                totalDiagnosed += diagnosed;
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "proactiveDiagnose",
                        "扫描" + tenantOrders.size() + "个活跃订单，" + diagnosed + "个高危已推送",
                        System.currentTimeMillis() - start, true);
                traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                        diagnosed + "个高危已推送建议", null, System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.error("[ProactivePatrol] 租户{}巡检异常", tenantId, e);
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            } finally {
                UserContext.clear();
            }
        }
        log.info("[ProactivePatrol] 巡检完成，共 {} 个活跃订单，{} 个高危已推送建议", activeOrders.size(), totalDiagnosed);
    }

    private String buildOrderGlobalContext(ProductionOrder order) {
        StringBuilder sb = new StringBuilder();
        sb.append("订单号：").append(order.getOrderNo());
        sb.append(", 状态：").append(order.getStatus());
        sb.append(", 进度：").append(order.getProductionProgress() != null ? order.getProductionProgress() + "%" : "未知");

        if (order.getPlannedEndDate() != null) {
            long daysToDeadline = ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate());
            sb.append(", 距交期：").append(daysToDeadline).append("天");
            if (daysToDeadline < 0) {
                sb.append("（已逾期").append(Math.abs(daysToDeadline)).append("天）");
            }
        }

        if (order.getFactoryName() != null) {
            sb.append(", 工厂：").append(order.getFactoryName());
        }
        if (order.getMerchandiser() != null) {
            sb.append(", 跟单员：").append(order.getMerchandiser());
        }

        return sb.toString();
    }

    private boolean isAtRisk(ProductionOrder order, String context) {
        if (order.getProductionProgress() != null && order.getPlannedEndDate() != null) {
            long daysToDeadline = ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate());
            if (daysToDeadline < 0) return true;
            if (daysToDeadline <= 3 && order.getProductionProgress() < 50) return true;
            if (daysToDeadline <= 7 && order.getProductionProgress() < 20) return true;
        }
        return false;
    }

    /**
     * D-702：巡检会诊去重 —— 同一订单「状态指纹未变」且仍在去重窗口内则跳过。
     *
     * <p><b>指纹构成</b>：{@code 进度档位(10%一档) + 距截止天数档位(2天一档)}。
     * 刻意取「档位」而非精确值 —— 进度从 31% 变成 32% 属于噪声，不该触发重判；
     * 而从 55% 掉到 35%（跨档）说明真实恶化，必须重新会诊。
     *
     * <p><b>安全兜底</b>：Redis 不可用 / 未注入 / 去重开关为 0 时，
     * 一律返回 {@code false}（不去重），行为退回 D-700 之前的原样，
     * <b>绝不因为去重组件故障而漏掉高危订单</b>。
     *
     * @return true = 应跳过（刚诊断过且状态未变）
     */
    private boolean shouldSkipDuplicatedDiagnosis(Long tenantId, ProductionOrder order) {
        if (patrolDedupHours <= 0 || patrolDedupRedis == null) {
            return false;   // 去重关闭或 Redis 不可用 → 不去重，保证不漏检
        }
        String key = "patrol:dedup:" + (tenantId == null ? 0 : tenantId) + ":"
                + order.getOrderNo() + ":" + fingerprint(order);
        try {
            // SETNX 语义：首次诊断成功后写入窗口；窗口内重复则跳过
            Boolean exists = patrolDedupRedis.hasKey(key);
            if (Boolean.TRUE.equals(exists)) {
                return true;
            }
            patrolDedupRedis.opsForValue().set(key, "1", patrolDedupHours, TimeUnit.HOURS);
            return false;
        } catch (Exception e) {
            // Redis 出错时不去重：宁可多花 token，也不能漏掉高危订单
            log.warn("[ProactivePatrol] 去重判断失败，按未诊断处理: {}", e.getMessage());
            return false;
        }
    }

    /** 状态指纹：进度档位 + 距截止天数档位（变化才重新会诊） */
    private String fingerprint(ProductionOrder order) {
        int progressBucket = (order.getProductionProgress() == null ? 0 : order.getProductionProgress()) / 10;
        long days = order.getPlannedEndDate() == null ? 999
                : ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate());
        long daysBucket = days <= 0 ? -1 : days / 2;   // 逾期统一归 -1（档位即可，具体天数变化不重复判）
        return "p" + progressBucket + "d" + daysBucket;
    }

    private void recordRiskInsight(Long tenantId, ProductionOrder order, String context) {
        try {
            ProactiveInsightService insightService = proactiveInsightServiceProvider.getIfAvailable();
            if (insightService == null) return;

            long daysToDeadline = order.getPlannedEndDate() != null
                    ? ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate()) : 0;
            String severity = daysToDeadline < 0 ? "critical" : "warning";
            String type = daysToDeadline < 0 ? "delay_risk" : "combo_risk";
            String title = daysToDeadline < 0
                    ? "订单逾期风险: " + order.getOrderNo()
                    : "订单交期预警: " + order.getOrderNo();

            insightService.recordInsight(tenantId, type, title, context, severity);
        } catch (Exception e) {
            log.debug("[ProactivePatrol] 记录洞察失败（不影响巡检）: {}", e.getMessage());
        }
    }
}
