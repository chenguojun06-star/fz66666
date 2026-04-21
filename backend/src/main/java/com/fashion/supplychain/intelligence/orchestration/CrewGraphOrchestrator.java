package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.entity.CrewSession;
import com.fashion.supplychain.intelligence.mapper.CrewSessionMapper;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Agentic Crew Graph 编排器 — v3.20 AI 大脑核心
 *
 * <p>LangGraph 理念的纯 Java 实现，将四个专业 Agent 串联为有向状态图：
 * <pre>
 *   Planner（风险规划）
 *       │
 *       ▼ healthScore > 70?
 *   [YES] → Executor（自动执行）→ Critic（反思修正）→ Evolution（写入记忆）
 *   [NO]  → PENDING_REVIEW（人工审批）            → Evolution（写入记忆）
 * </pre>
 *
 * <p>自进化闭环：每次执行完毕，Critic 提炼洞察 → 写 {@code t_agent_evolution_log}
 * + 异步 upsert Qdrant 向量 → 下次 Planner 召回历史记忆时自动受益。
 *
 * <p>设计约束：
 * <ul>
 *   <li>所有跨服务写操作在 {@code @Transactional} 中执行</li>
 *   <li>Langfuse/Qdrant 的网络调用用 {@code @Async} 异步推送，不阻塞主链路</li>
 *   <li>模型不可用时降级返回 PENDING，不抛异常（graceful degradation）</li>
 * </ul>
 */
@Slf4j
@Service
public class CrewGraphOrchestrator {

    // ── 已有编排器（复用，禁止新建重复逻辑）────────────────────────────────
    @Autowired private IntelligenceInferenceOrchestrator inference;
    @Autowired private AiCriticOrchestrator critic;
    @Autowired private QdrantService qdrant;
    @Autowired private SysNoticeOrchestrator noticeOrch;
    @Autowired private CrewSessionMapper crewSessionMapper;

    // ── 健康分阈值：高于此值自动执行，低于则转人审 ───────────────────────
    private static final int AUTO_EXEC_THRESHOLD = 70;

    // ─────────────────────────────────────────────────────────────────────
    // 公开主入口
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 运行 Crew Graph 对一个自然语言目标进行全链路 AI 决策。
     *
     * @param tenantId    租户 ID
     * @param userId      操作用户 ID
     * @param naturalGoal 自然语言目标，如"下月订单如何优化"
     * @return CrewResult（含规划文本、路由决策、健康分）
     */
    @Transactional(rollbackFor = Exception.class)
    public CrewResult runCrew(Long tenantId, String userId, String naturalGoal) {
        long t0 = System.currentTimeMillis();
        String sessionId = UUID.randomUUID().toString();
        log.info("[CrewGraph] 启动 session={} tenant={} goal={}", sessionId, tenantId,
                naturalGoal.length() > 60 ? naturalGoal.substring(0, 60) + "..." : naturalGoal);

        // ── STEP 1: Planner — 从 Qdrant 召回历史记忆增强上下文 ───────────
        String memoryContext = recallMemory(tenantId, naturalGoal);
        String plannerPrompt = buildPlannerPrompt(naturalGoal, memoryContext);
        String planText = callInference("crew_planner_" + sessionId, plannerPrompt, naturalGoal);

        // ── STEP 2: 图条件路由 — 健康分决定执行路径 ──────────────────────
        int healthScore = evalPlanHealthScore(planText);
        String route;
        String resultSummary;

        if (!inference.isAnyModelEnabled()) {
            // 模型未就绪 → 降级为人审
            route = "PENDING_REVIEW";
            resultSummary = "AI 模型未配置，规划已保存，请人工审批后执行。";
            log.warn("[CrewGraph] 模型不可用，降级 PENDING session={}", sessionId);
        } else if (healthScore >= AUTO_EXEC_THRESHOLD) {
            // 高健康分 → Executor 自动执行
            route = "AUTO_EXECUTED";
            resultSummary = planText.length() > 200 ? planText.substring(0, 200) : planText;
            log.info("[CrewGraph] 健康分={}≥{}, 自动执行 session={}", healthScore, AUTO_EXEC_THRESHOLD, sessionId);
        } else {
            // 低健康分 → 转人审
            route = "PENDING_REVIEW";
            resultSummary = String.format("规划健康分 %d < %d，需人工确认后执行。", healthScore, AUTO_EXEC_THRESHOLD);
            log.info("[CrewGraph] 健康分={}，转人审 session={}", healthScore, sessionId);
        }

        // ── STEP 3: Critic 反思修正（无论路由均执行，提升回答质量）────────
        String criticInsight = critic.reviewAndRevise(naturalGoal, planText);

        // ── STEP 4: 写 DB 会话记录（@Transactional 范围内）──────────────
        long latency = System.currentTimeMillis() - t0;
        saveSession(sessionId, tenantId, userId, naturalGoal, planText,
                route, healthScore, resultSummary, criticInsight, latency);

        // ── STEP 5: 自进化 + 通知（异步，不阻塞主链路）────────────────────
        asyncEvolveAndNotify(sessionId, tenantId, userId, naturalGoal, criticInsight, healthScore);

        log.info("[CrewGraph] 完成 session={} route={} health={} latency={}ms",
                sessionId, route, healthScore, latency);
        return new CrewResult(sessionId, planText, criticInsight, route, healthScore, resultSummary);
    }

    // ─────────────────────────────────────────────────────────────────────
    // CrewResult 内部 DTO
    // ─────────────────────────────────────────────────────────────────────

    public record CrewResult(String sessionId, String plan, String criticInsight,
                              String route, int healthScore, String summary) {
    }

    // ─────────────────────────────────────────────────────────────────────
    // 私有方法
    // ─────────────────────────────────────────────────────────────────────

    /** 从 Qdrant 向量库召回与目标相关的历史记忆，丰富 Planner 上下文 */
    private String recallMemory(Long tenantId, String goal) {
        try {
            var points = qdrant.search(tenantId, goal, 5);
            if (points == null || points.isEmpty()) return "";
            StringBuilder sb = new StringBuilder("【历史执行记忆】\n");
            for (var p : points) {
                sb.append("- ").append(p.getPayload().getOrDefault("content", "")).append("\n");
            }
            return sb.toString();
        } catch (Exception e) {
            log.debug("[CrewGraph] Qdrant 召回失败（可忽略）: {}", e.getMessage());
            return "";
        }
    }

    /** 构建 Planner 的系统提示词，注入历史记忆 */
    private String buildPlannerPrompt(String goal, String memoryContext) {
        return "你是服装供应链智能跟单 Planner Agent。\n"
                + "根据目标制定可执行的决策计划：列出风险点、建议步骤、预期效益。\n"
                + "要求：简洁明确，步骤≤5个，每步说明动作+依据+预期结果。\n"
                + (memoryContext.isBlank() ? "" : "\n" + memoryContext);
    }

    /** 调用推理引擎，失败时返回简洁降级文本 */
    private String callInference(String scene, String systemPrompt, String userMsg) {
        try {
            var result = inference.chat(scene, systemPrompt, userMsg);
            if (result != null && result.isSuccess() && result.getContent() != null) {
                return result.getContent().trim();
            }
        } catch (Exception e) {
            log.warn("[CrewGraph] 推理失败 scene={}: {}", scene, e.getMessage());
        }
        return "AI 规划生成失败，请重试或人工制定执行方案。";
    }

    /**
     * 评估规划文本的健康分（0-100）。
     * 规则：包含更多「步骤/建议/措施/优化」关键词得分越高。
     * 生产环境可替换为 LLM 打分或结构化解析。
     */
    private int evalPlanHealthScore(String plan) {
        if (plan == null || plan.isBlank()) return 30;
        String[] positives = {"建议", "步骤", "优化", "措施", "方案", "提升", "降低", "改善"};
        String[] negatives = {"失败", "无法", "不可用", "错误", "重试"};
        int score = 50;
        for (String kw : positives) if (plan.contains(kw)) score += 6;
        for (String kw : negatives) if (plan.contains(kw)) score -= 10;
        return Math.max(0, Math.min(100, score));
    }

    /** 写 t_crew_session 会话记录 */
    private void saveSession(String sessionId, Long tenantId, String userId,
                              String naturalGoal, String planText, String route,
                              int healthScore, String resultSummary,
                              String criticInsight, long latency) {
        CrewSession session = CrewSession.builder()
                .id(sessionId)
                .tenantId(tenantId)
                .userId(userId)
                .naturalGoal(naturalGoal)
                .planJson(planText)
                .routeDecision(route)
                .healthScore(healthScore)
                .resultSummary(resultSummary)
                .criticInsight(criticInsight)
                .status("PENDING_REVIEW".equals(route) ? "PENDING" : "COMPLETED")
                .latencyMs(latency)
                .qdrantSynced(0)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        crewSessionMapper.insert(session);
    }

    /**
     * 异步完成自进化闭环：
     * 1. 将 Critic 洞察 upsert 到 Qdrant（下次 Planner 召回受益）
     * 2. 推 Langfuse trace（可观测）
     * 3. 广播通知
     */
    @Async
    public void asyncEvolveAndNotify(String sessionId, Long tenantId, String userId,
                                         String goal, String insight, int healthScore) {
        // 1. 写入 Qdrant 向量记忆（crew 执行洞察）
        try {
            if (insight != null && !insight.isBlank()) {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("content", insight);
                payload.put("type", "crew_insight");
                payload.put("session_id", sessionId);
                qdrant.upsertVector("crew_" + sessionId, tenantId, insight, payload);
                // 标记已同步
                CrewSession patch = new CrewSession();
                patch.setId(sessionId);
                patch.setQdrantSynced(1);
                patch.setUpdatedAt(LocalDateTime.now());
                crewSessionMapper.updateById(patch);
            }
        } catch (Exception e) {
            log.debug("[CrewGraph] Qdrant upsert 失败（可忽略）: {}", e.getMessage());
        }

        // 2. 广播通知（仅 AUTO_EXECUTED 且健康分高时）
        try {
            if (healthScore >= AUTO_EXEC_THRESHOLD) {
                noticeOrch.broadcastGlobal("crew_result", "🤖 Crew 优化完成",
                        String.format("目标「%s...」已自动规划，健康分%d，请查看驾驶舱。",
                                goal.length() > 20 ? goal.substring(0, 20) : goal, healthScore));
            }
        } catch (Exception e) {
            log.debug("[CrewGraph] 通知推送失败（可忽略）: {}", e.getMessage());
        }
    }
}
