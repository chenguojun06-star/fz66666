package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse;
import com.fashion.supplychain.intelligence.orchestration.HyperAdvisorOrchestrator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class HyperAdvisorTool extends AbstractAgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private HyperAdvisorOrchestrator hyperAdvisorOrchestrator;

    @Override
    public String getName() {
        return "tool_hyper_advisor";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> question = new LinkedHashMap<>();
        question.put("type", "string");
        question.put("description", "需要顾问分析的问题，如风险预判、延期推演、产能模拟、策略建议等");
        properties.put("question", question);

        Map<String, Object> sessionId = new LinkedHashMap<>();
        sessionId.put("type", "string");
        sessionId.put("description", "【可选】顾问会话ID，不传则自动创建新会话");
        properties.put("sessionId", sessionId);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("高级供应链 AI 顾问工具，提供风险量化、延期推演、产能模拟、策略建议等专业分析。" +
                "当用户需要深度分析、风险预判、what-if模拟、专业建议时调用此工具。" +
                "【重要】标注为可选的参数不要追问，直接用默认值执行。");

        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("question"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        log.info("Tool: {} called", getName());
        Map<String, Object> args = Map.of();
        if (argumentsJson != null && !argumentsJson.isBlank()) {
            args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});
        }

        String question = (String) args.getOrDefault("question", "");
        String sessionId = (String) args.getOrDefault("sessionId", null);

        if (question.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "question 参数不能为空"));
        }

        try {
            TenantAssert.assertTenantContext();
        } catch (Exception e) {
            return MAPPER.writeValueAsString(Map.of("error", "租户上下文丢失，请重新登录"));
        }

        try {
            if (sessionId == null || sessionId.isBlank()) {
                sessionId = UUID.randomUUID().toString();
            }
            HyperAdvisorResponse resp = hyperAdvisorOrchestrator.ask(sessionId, question);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("sessionId", resp.getSessionId());
            result.put("analysis", resp.getAnalysis());
            result.put("needsClarification", resp.isNeedsClarification());
            if (resp.getRiskIndicators() != null && !resp.getRiskIndicators().isEmpty()) {
                result.put("riskIndicators", resp.getRiskIndicators());
            }
            if (resp.getSimulation() != null) {
                result.put("simulation", resp.getSimulation());
            }
            if (resp.getTraceId() != null) {
                result.put("traceId", resp.getTraceId());
            }
            return MAPPER.writeValueAsString(result);
        } catch (Exception e) {
            log.warn("[HyperAdvisorTool] 执行失败: {}", e.getMessage());
            return MAPPER.writeValueAsString(Map.of("error", "顾问分析失败: " + e.getMessage()));
        }
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.ANALYSIS;
    }
}
