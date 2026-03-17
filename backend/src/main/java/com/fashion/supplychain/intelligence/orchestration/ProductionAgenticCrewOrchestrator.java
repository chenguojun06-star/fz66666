package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.entity.ProductionCrewMemory;
import com.fashion.supplychain.intelligence.mapper.ProductionCrewMemoryMapper;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.production.orchestration.OrderHealthScoreOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 生产域 Agentic Crew 大脑。
 *
 * <p>将通用 CrewGraph（CrewGraphOrchestrator）与实际生产数据打通：
 * <ol>
 *   <li>Planner（LLM） ← 订单上下文 + Qdrant 历史记忆</li>
 *   <li>健康评分驱动路由：≥75 AUTO_EXECUTED / ≥50 CRITIC_REVISED / &lt;50 CRITICAL_ALERT</li>
 *   <li>危险订单触发 {@link SysNoticeOrchestrator#broadcastGlobal} 全局预警</li>
 *   <li>结果异步写入 Qdrant + 持久化到 t_production_crew_memory</li>
 *   <li>Langfuse 可观测性 trace 推送（@Async，不阻塞主链路）</li>
 * </ol>
 *
 * <p>零前端依赖——纯后端编排，供 REST Controller 或定时任务（@Scheduled）调用。
 */
@Slf4j
@Service
public class ProductionAgenticCrewOrchestrator {

    // --- 阈值常量 ---
    private static final int THRESHOLD_AUTO   = 75;  // ≥75 → 自动执行
    private static final int THRESHOLD_WARN   = 50;  // ≥50 → Critic修正
    // <50 → CRITICAL_ALERT 广播

    // --- 依赖注入 ---
    @Autowired private IntelligenceInferenceOrchestrator inference;
    @Autowired private AiCriticOrchestrator              critic;
    @Autowired private LangfuseTraceOrchestrator         langfuse;
    @Autowired private OrderHealthScoreOrchestrator      healthScore;
    @Autowired private ProductionOrderService            productionOrderService;
    @Autowired private QdrantService                     qdrant;
    @Autowired private SysNoticeOrchestrator             noticeOrch;
    @Autowired private ProductionCrewMemoryMapper        memoryMapper;

    /** 单次 Crew 分析结果 */
    public record CrewRunResult(String sessionId, String orderNo, int score,
                                String route, String plan, String insight, String summary) {}

    // =========================================================================
    // 公开 API
    // =========================================================================

    /**
     * 对指定订单运行完整 Agentic Crew 分析。
     * 通常由 Controller 或内部定时任务调用。
     */
    @Transactional(rollbackFor = Exception.class)
    public CrewRunResult runProductionCrew(Long tenantId, String userId, String orderNo) {
        long t0 = System.currentTimeMillis();
        String sessionId = UUID.randomUUID().toString();

        // Step1 — 获取订单实体 + 健康评分
        ProductionOrder order = fetchOrder(tenantId, orderNo);
        if (order == null) {
            return fail(sessionId, orderNo, "订单不存在: " + orderNo);
        }
        int score  = healthScore.calcScore(order);
        String lvl = healthScore.scoreToLevel(score);

        // Step2 — Qdrant 拉取历史记忆增强 Planner 提示
        String memory = recallMemory(tenantId, "production crew " + orderNo);

        // Step3 — LLM Planner 生成执行方案
        IntelligenceInferenceResult planResult = inference.chat(
                "production_crew_planner",
                buildPlannerSystemPrompt(memory),
                buildOrderContext(order, score, lvl));

        if (!planResult.isSuccess()) {
            log.warn("[ProdCrew] Planner 推理失败 orderNo={}", orderNo);
            return fail(sessionId, orderNo, "规划推理暂不可用");
        }

        String plan = planResult.getContent();

        // Step4 — 路由决策（健康分决定是否交 Critic 深度优化）
        String route, insight;
        if (score >= THRESHOLD_AUTO) {
            route   = "AUTO_EXECUTED";
            insight = plan;
        } else if (score >= THRESHOLD_WARN) {
            insight = critic.reviewAndRevise("生产订单优化建议：" + orderNo, plan);
            route   = "CRITIC_REVISED";
        } else {
            insight = critic.reviewAndRevise("高危订单紧急预案：" + orderNo, plan);
            route   = "CRITICAL_ALERT";
        }

        String summary = "订单" + orderNo + " 健康分" + score + "(" + lvl + ") → " + route;
        long latency   = System.currentTimeMillis() - t0;

        // Step5 — 持久化记忆
        ProductionCrewMemory mem = new ProductionCrewMemory();
        mem.setTenantId(tenantId);
        mem.setSessionId(sessionId);
        mem.setOrderNo(orderNo);
        mem.setPlan(plan);
        mem.setActionJson(insight.length() > 500 ? insight.substring(0, 500) : insight);
        mem.setHealthScore(score);
        mem.setLevel(lvl);
        mem.setRoute(route);
        mem.setCreateTime(LocalDateTime.now());
        memoryMapper.insert(mem);

        // Step6 — 异步：Qdrant 写向量 + 通知 + Langfuse
        postProcess(sessionId, tenantId, userId, orderNo, insight, score, route, planResult);

        log.info("[ProdCrew] {} score={} route={} latency={}ms", orderNo, score, route, latency);
        return new CrewRunResult(sessionId, orderNo, score, route, plan, insight, summary);
    }

    /**
     * 批量扫描租户内健康分偏低的进行中订单，对每个危险订单运行 Crew 分析。
     * 适合每日定时任务调用（@Scheduled）。
     *
     * @param maxOrders 最多处理条数（防止超时，建议 ≤ 15）
     */
    @Transactional(rollbackFor = Exception.class)
    public List<CrewRunResult> scanDangerOrders(Long tenantId, String userId, int maxOrders) {
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .notIn(ProductionOrder::getStatus, "COMPLETED", "CANCELLED")
                .last("LIMIT " + Math.min(maxOrders, 20))
                .list();

        List<CrewRunResult> results = new ArrayList<>();
        for (ProductionOrder o : orders) {
            if (healthScore.calcScore(o) < THRESHOLD_AUTO) {
                results.add(runProductionCrew(tenantId, userId, o.getOrderNo()));
            }
        }
        return results;
    }

    // =========================================================================
    // 异步后处理（不阻塞主事务）
    // =========================================================================

    @Async
    protected void postProcess(String sessionId, Long tenantId, String userId,
                               String orderNo, String insight, int score,
                               String route, IntelligenceInferenceResult planResult) {
        // (a) Qdrant 向量写入，payload 中包含 content 以便 recall
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("content", insight);
            payload.put("order_no", orderNo);
            payload.put("score", String.valueOf(score));
            payload.put("route", route);
            payload.put("type", "production_crew");
            qdrant.upsertVector("prod_crew_" + sessionId, tenantId, insight, payload);
        } catch (Exception e) {
            log.debug("[ProdCrew] Qdrant 写入失败（可降级）: {}", e.getMessage());
        }

        // (b) CRITICAL_ALERT 广播全局通知
        if ("CRITICAL_ALERT".equals(route)) {
            try {
                noticeOrch.broadcastGlobal(
                        "crew_alert",
                        "🚨 生产Crew预警",
                        "订单 " + orderNo + " 健康分" + score + "，AI建议：" + trunc(insight, 60));
            } catch (Exception e) {
                log.debug("[ProdCrew] 广播通知失败: {}", e.getMessage());
            }
        }

        // (c) Langfuse trace 推送
        langfuse.pushTrace("production_crew", tenantId, userId, planResult);
    }

    // =========================================================================
    // 私有工具方法
    // =========================================================================

    private ProductionOrder fetchOrder(Long tenantId, String orderNo) {
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getOrderNo, orderNo)
                .one();
    }

    private String buildOrderContext(ProductionOrder o, int score, String lvl) {
        long daysLeft = o.getExpectedShipDate() != null
                ? ChronoUnit.DAYS.between(LocalDate.now(), o.getExpectedShipDate()) : -1;
        return String.format(
                "订单号:%s 颜色:%s 进度:%d%% 采购完成:%d%% 剩余天数:%d 健康分:%d(%s)",
                o.getOrderNo(),
                nvl(o.getColor(), "未知"),
                nvl(o.getProductionProgress()),
                nvl(o.getProcurementCompletionRate()),
                daysLeft, score, lvl);
    }

    private String buildPlannerSystemPrompt(String memory) {
        String base = "你是专业服装供应链规划员。根据订单状态给出50字以内的简洁执行建议，" +
                      "重点关注：是否需要加急、是否需要调整产能、是否有逾期风险。";
        return memory.isBlank() ? base : base + "\n\n" + memory;
    }

    /** 从 Qdrant 召回历史记忆，作为 Planner 的上下文增强 */
    private String recallMemory(Long tenantId, String query) {
        try {
            List<QdrantService.ScoredPoint> pts = qdrant.search(tenantId, query, 3);
            if (pts == null || pts.isEmpty()) return "";
            StringBuilder sb = new StringBuilder("历史记忆:\n");
            pts.forEach(p -> {
                Map<String, String> pl = p.getPayload();
                String c = pl != null ? pl.getOrDefault("content", pl.getOrDefault("order_no", "")) : "";
                if (!c.isBlank()) sb.append("- ").append(trunc(c, 80)).append("\n");
            });
            return sb.toString().trim();
        } catch (Exception e) {
            return "";
        }
    }

    private CrewRunResult fail(String sessionId, String orderNo, String msg) {
        log.warn("[ProdCrew] 失败 orderNo={} msg={}", orderNo, msg);
        return new CrewRunResult(sessionId, orderNo, -1, "FAILED", "", "", msg);
    }

    private int nvl(Integer v)               { return v != null ? v : 0; }
    private String nvl(String s, String def) { return s != null && !s.isBlank() ? s : def; }
    private String trunc(String s, int n)    { return s != null && s.length() > n ? s.substring(0, n) + "…" : s; }
}
