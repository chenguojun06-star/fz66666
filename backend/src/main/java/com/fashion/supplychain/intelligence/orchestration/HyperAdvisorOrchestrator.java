package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse.RiskIndicator;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse.SimulationResult;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

/**
 * 超级 AI 业务顾问 — 中枢编排器
 *
 * <p>管线（D-320 简化）：
 * <pre>
 *   1. 风险量化 — 直接查库（AdvisorRiskOrchestrator），数字不经过 LLM
 *   2. 数字孪生模拟 — 仅当用户明确请求时（AdvisorSimulationOrchestrator）
 *   3. analysis 文本 = 基于量化结果的确定性摘要（前端只消费结构化字段，
 *      原先的 LLM 推理结论从不展示，属于纯 token 成本，已移除）
 *   4. 异步回写会话 + 画像更新
 * </pre>
 */
@Service
@Lazy
@Slf4j
public class HyperAdvisorOrchestrator {

    @Autowired private AdvisorSessionOrchestrator sessionOrchestrator;
    @Autowired private AdvisorProfileOrchestrator profileOrchestrator;
    @Autowired private AdvisorRiskOrchestrator riskOrchestrator;
    @Autowired private AdvisorSimulationOrchestrator simulationOrchestrator;
    @Autowired private AiAgentTraceOrchestrator traceOrchestrator;

    /**
     * 主入口 — 处理一次用户提问
     */
    public HyperAdvisorResponse ask(String sessionId, String userMessage) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        if (sessionId == null) sessionId = UUID.randomUUID().toString();

        String commandId = null;
        long startTime = System.currentTimeMillis();
        try {
            commandId = traceOrchestrator.startRequest(userMessage, "hyper-advisor:request");
        } catch (Exception e) {
            log.debug("[HyperAdvisor] trace startRequest 失败: {}", e.getMessage());
        }

        HyperAdvisorResponse resp = new HyperAdvisorResponse();
        resp.setSessionId(sessionId);

        List<RiskIndicator> risks = List.of();
        try {
            risks = riskOrchestrator.quantifyRisks();
            resp.setRiskIndicators(risks);
        } catch (Exception e) {
            log.warn("[HyperAdvisor] 风险量化失败: {}", e.getMessage());
        }

        attachSimulationIfRequested(userMessage, resp);

        String analysis = buildRiskBrief(risks, resp.getSimulation());
        resp.setAnalysis(analysis);
        resp.setNeedsClarification(false);
        resp.setProfileHint(null);
        persistAsync(tenantId, userId, sessionId, userMessage, analysis);

        if (commandId != null) {
            try {
                traceOrchestrator.finishRequest(commandId, analysis, null, System.currentTimeMillis() - startTime);
            } catch (Exception e) { log.debug("[HyperAdvisor] trace finishRequest 失败: {}", e.getMessage()); }
        }

        return resp;
    }

    /** 基于量化风险的确定性摘要，替代原先白烧 token 的 LLM 推理结论 */
    private String buildRiskBrief(List<RiskIndicator> risks, HyperAdvisorResponse.SimulationResult simulation) {
        StringBuilder sb = new StringBuilder("已按当前数据库量化业务风险：");
        if (risks.isEmpty()) {
            sb.append("\n• 暂无风险指标数据");
        } else {
            for (RiskIndicator r : risks) {
                sb.append("\n• ").append(r.getName()).append("：").append(r.getDescription())
                        .append("（风险度").append(Math.round(r.getProbability() * 100))
                        .append("%，等级").append(r.getLevel()).append("）");
            }
        }
        if (simulation != null) {
            sb.append("\n\n模拟（").append(simulation.getScenarioDescription()).append("）");
            if (simulation.getRecommendation() != null && !simulation.getRecommendation().isBlank()) {
                sb.append("\n建议：").append(simulation.getRecommendation());
            }
        }
        return sb.toString();
    }

    private void attachSimulationIfRequested(String userMessage, HyperAdvisorResponse resp) {
        try {
            String lower = userMessage.toLowerCase();
            if (lower.contains("延期") || lower.contains("推迟") || lower.contains("delay")) {
                int days = extractNumber(userMessage, 7);
                SimulationResult sim = simulationOrchestrator.simulateDelay(days);
                resp.setSimulation(sim);
            } else if (lower.contains("产能") || lower.contains("提升") || lower.contains("加速")) {
                int pct = extractNumber(userMessage, 20);
                SimulationResult sim = simulationOrchestrator.simulateCapacityBoost(pct);
                resp.setSimulation(sim);
            }
        } catch (Exception e) {
            log.debug("[HyperAdvisor] 模拟执行跳过: {}", e.getMessage());
        }
    }

    @Async
    public void persistAsync(Long tenantId, String userId, String sessionId,
                                String userMessage, String analysis) {
        try {
            sessionOrchestrator.saveMessage(tenantId, userId, sessionId, "user", userMessage, null);
            sessionOrchestrator.saveMessage(tenantId, userId, sessionId, "assistant", analysis, null);
            profileOrchestrator.appendBehavior(tenantId, userId,
                    "提问:" + truncate(userMessage, 60));
        } catch (Exception e) {
            log.warn("[HyperAdvisor] 异步持久化失败: {}", e.getMessage());
        }
    }

    /** 从文本中提取第一个数字，缺省使用 defaultVal */
    private int extractNumber(String text, int defaultVal) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+)").matcher(text);
        return m.find() ? Integer.parseInt(m.group(1)) : defaultVal;
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) : s;
    }
}
