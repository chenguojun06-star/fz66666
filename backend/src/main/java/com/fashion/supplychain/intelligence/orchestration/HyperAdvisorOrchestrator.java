package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse.RiskIndicator;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse.SimulationResult;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * 超级 AI 业务顾问 — 中枢编排器
 *
 * <p>串联 5 个独立子编排器，按固定管线执行：
 * <pre>
 *   1. 加载会话历史 (AdvisorSessionOrchestrator)
 *   2. 注入用户画像 (AdvisorProfileOrchestrator)
 *   3. LLM 推理 + 多轮澄清检测 (IntelligenceInferenceOrchestrator)
 *   4. 风险量化 (AdvisorRiskOrchestrator)
 *   5. 数字孪生模拟 — 仅当用户明确请求时 (AdvisorSimulationOrchestrator)
 *   6. 异步回写会话 + 画像更新
 * </pre>
 */
@Service
@Slf4j
public class HyperAdvisorOrchestrator {

    @Autowired private AdvisorSessionOrchestrator sessionOrchestrator;
    @Autowired private AdvisorProfileOrchestrator profileOrchestrator;
    @Autowired private AdvisorRiskOrchestrator riskOrchestrator;
    @Autowired private AdvisorSimulationOrchestrator simulationOrchestrator;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private LangfuseTraceOrchestrator langfuseTraceOrchestrator;

    private static final String SYSTEM_PROMPT_TEMPLATE = """
            你是服装供应链高级 AI 顾问。
            %s
            %s
            请根据用户问题给出专业建议。如果问题模糊或缺少关键信息（如款号、工厂名、时间范围），请先提出 1-2 个澄清问题，并在回答开头标注 [需要澄清]。
            回答要求：简洁、专业、可操作。不要编造数据，未知的直接说明。""";

    /**
     * 主入口 — 处理一次用户提问
     */
    public HyperAdvisorResponse ask(String sessionId, String userMessage) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        if (sessionId == null) sessionId = UUID.randomUUID().toString();

        HyperAdvisorResponse resp = new HyperAdvisorResponse();
        resp.setSessionId(sessionId);

        // 1. 会话上下文
        String historyContext = sessionOrchestrator.loadSessionContext(tenantId, sessionId);

        // 2. 用户画像
        String profileContext = profileOrchestrator.buildProfilePrompt(tenantId, userId);

        // 3. LLM 推理
        String systemPrompt = String.format(SYSTEM_PROMPT_TEMPLATE, historyContext, profileContext);
        IntelligenceInferenceResult llmResult;
        try {
            llmResult = inferenceOrchestrator.chat("hyper_advisor", systemPrompt, userMessage);
        } catch (Exception e) {
            log.error("[HyperAdvisor] LLM调用失败: {}", e.getMessage());
            resp.setAnalysis("AI 推理服务暂时不可用，请稍后重试");
            return resp;
        }
        resp.setTraceId(llmResult.getTraceId());

        String analysis = llmResult.isSuccess() ? llmResult.getContent() : "AI 未能成功生成回答";
        resp.setAnalysis(analysis);

        // 4. 多轮澄清检测
        resp.setNeedsClarification(analysis.contains("[需要澄清]"));

        // 5. 风险量化（每次附带，供前端 ECharts 渲染）
        try {
            List<RiskIndicator> risks = riskOrchestrator.quantifyRisks();
            resp.setRiskIndicators(risks);
        } catch (Exception e) {
            log.warn("[HyperAdvisor] 风险量化失败: {}", e.getMessage());
        }

        // 6. 模拟（仅当用户提问中涉及假设场景）
        attachSimulationIfRequested(userMessage, resp);

        // 7. 画像提示
        resp.setProfileHint(profileContext.isEmpty() ? null : "已加载个性化画像");

        // 8. 异步：保存会话 + 更新画像
        persistAsync(tenantId, userId, sessionId, userMessage, analysis);

        // 9. 推送 Langfuse trace
        pushTraceAsync(tenantId, userId, llmResult);

        return resp;
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
    protected void persistAsync(Long tenantId, String userId, String sessionId,
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

    private void pushTraceAsync(Long tenantId, String userId, IntelligenceInferenceResult result) {
        try {
            langfuseTraceOrchestrator.pushTrace("hyper_advisor", tenantId, userId, result);
        } catch (Exception e) {
            log.debug("[HyperAdvisor] Trace推送跳过: {}", e.getMessage());
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
