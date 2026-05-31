package com.fashion.supplychain.intelligence.agent.planning;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Component
public class AgentPlanningEngine {

    @Autowired
    private AiInferenceGateway inferenceGateway;

    @Value("${xiaoyun.planning.enabled:true}")
    private boolean planningEnabled;

    @Value("${xiaoyun.planning.min-complexity-score:40}")
    private int minComplexityScore;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String PLANNING_SYSTEM_PROMPT = """
你是一个供应链AI的规划引擎。你需要分析用户的问题，判断其复杂度，并决定是否需要制定执行计划。

## 复杂度评分标准（0-100）：
- 0-20: 闲聊/问候/简单确认 - 不需要规划
- 21-40: 简单查询（查一个订单/工厂） - 不需要规划
- 41-60: 中等查询（需要查2-3个数据源） - 需要简单规划
- 61-80: 复杂查询（需要综合分析多个维度） - 需要详细规划
- 81-100: 高风险决策（涉及交期/成本/人员变动） - 必须详细规划+风险标注

## 行动动词映射：
- 查询/查看/检查 → 使用对应的查询工具
- 分析/评估/判断 → 先查数据，再分析
- 决策/执行/操作 → 先分析，再确认，再执行
- 对比/排名 → 查询多维度数据后综合

## 输出格式（严格的JSON）：
{
  "complexityScore": 60,
  "needsPlan": true,
  "goal": "一句话描述目标",
  "riskLevel": "low|medium|high|critical",
  "riskWarnings": ["风险1", "风险2"],
  "steps": [
    {
      "order": 1,
      "action": "用中文描述这一步做什么",
      "toolName": "工具名称或null",
      "rationale": "为什么需要这一步",
      "expectedOutput": "期望得到什么",
      "verificationCriteria": ["验证标准1"]
    }
  ],
  "expectedOutcome": "预期最终结果描述"
}

## 规则：
1. 如果不需要规划（needsPlan=false），steps 为空数组即可
2. 工具名称必须来自可用工具列表
3. 不要编造不存在的工具名
4. 每一步的 rationale 必须合理
5. 高风险操作（删除/关闭/结算/转账/变更工厂）必须标注风险
6. 查询步骤永远在执行步骤之前
""";

    public PlanResult analyzeAndPlan(String userMessage, List<Map<String, Object>> availableTools,
                                      String pageContext) {
        if (!planningEnabled) {
            return PlanResult.skip("规划引擎未启用");
        }

        int estimatedComplexity = estimateQuickComplexity(userMessage);
        if (estimatedComplexity < minComplexityScore) {
            return PlanResult.skip("问题复杂度低于阈值 (score=" + estimatedComplexity + ")");
        }

        try {
            String toolsDesc = buildToolsDescription(availableTools);
            String systemPrompt = PLANNING_SYSTEM_PROMPT + "\n\n## 当前可用工具:\n" + toolsDesc;

            String userPrompt = buildUserPrompt(userMessage, pageContext);

            List<AiMessage> messages = List.of(
                    AiMessage.system(systemPrompt),
                    AiMessage.user(userPrompt)
            );

            IntelligenceInferenceResult result = inferenceGateway.chat("planning", messages, List.of());

            if (!result.isSuccess() || result.getContent() == null || result.getContent().isBlank()) {
                log.warn("[PlanningEngine] 规划模型调用失败: {}", result.getErrorMessage());
                return PlanResult.skip("规划模型调用失败");
            }

            PlanResult planResult = parsePlanResult(result.getContent());
            planResult.setRawPlanContent(result.getContent());

            if (planResult.isSkip()) {
                return planResult;
            }

            if (planResult.getPlan() != null) {
                planResult.getPlan().setPlanId(UUID.randomUUID().toString().substring(0, 12));
                planResult.getPlan().setCreatedAt(System.currentTimeMillis());
            }

            log.info("[PlanningEngine] 规划完成: complexity={} steps={} risks={}",
                    planResult.getComplexityScore(),
                    planResult.getPlan() != null ? planResult.getPlan().getStepCount() : 0,
                    planResult.getPlan() != null && planResult.getPlan().getRiskWarnings() != null
                            ? planResult.getPlan().getRiskWarnings().size() : 0);

            return planResult;

        } catch (Exception e) {
            log.warn("[PlanningEngine] 规划异常，跳过规划: {}", e.getMessage());
            return PlanResult.skip("规划异常: " + e.getMessage());
        }
    }

    private int estimateQuickComplexity(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) return 0;

        int score = 0;
        String lower = userMessage.toLowerCase();

        if (userMessage.length() > 50) score += 10;
        if (userMessage.length() > 100) score += 10;
        if (userMessage.length() > 200) score += 10;

        long questionCount = lower.chars().filter(c -> c == '?' || c == '？').count();
        score += Math.min(questionCount * 5, 15);

        java.util.regex.Pattern complexPattern = java.util.regex.Pattern.compile(
                "(分析|评估|对比|排名|为什么|怎么回事|怎么办|怎么处理|帮.*决定|建议|规划|优化)");
        if (complexPattern.matcher(userMessage).find()) score += 20;

        java.util.regex.Pattern multiEntityPattern = java.util.regex.Pattern.compile(
                "(所有|全部|哪些|各个|每个|所有.*工厂|所有.*订单|整个)");
        if (multiEntityPattern.matcher(userMessage).find()) score += 15;

        java.util.regex.Pattern riskPattern = java.util.regex.Pattern.compile(
                "(逾期|风险|异常|损失|赔|罚款|紧急|危机)");
        if (riskPattern.matcher(userMessage).find()) score += 15;

        java.util.regex.Pattern actionPattern = java.util.regex.Pattern.compile(
                "(转厂|关闭|结算|审批|删除|修改|变更|执行|操作)");
        if (actionPattern.matcher(userMessage).find()) score += 15;

        return Math.min(score, 100);
    }

    private String buildToolsDescription(List<Map<String, Object>> availableTools) {
        if (availableTools == null || availableTools.isEmpty()) return "暂无可用工具";

        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> tool : availableTools) {
            String name = String.valueOf(tool.getOrDefault("name", "unknown"));
            String desc = String.valueOf(tool.getOrDefault("description", ""));
            String domain = String.valueOf(tool.getOrDefault("domain", "general"));

            String shortDesc = desc.length() > 80 ? desc.substring(0, 80) + "..." : desc;
            sb.append(String.format("- **%s** [%s]: %s\n", name, domain, shortDesc));
        }

        if (sb.length() > 3000) {
            sb.setLength(3000);
            sb.append("\n...(工具列表已截断)");
        }

        return sb.toString();
    }

    private String buildUserPrompt(String userMessage, String pageContext) {
        StringBuilder sb = new StringBuilder();
        sb.append("【用户问题】\n").append(userMessage).append("\n\n");

        if (pageContext != null && !pageContext.isBlank()) {
            String truncated = pageContext.length() > 500
                    ? pageContext.substring(0, 500) + "..."
                    : pageContext;
            sb.append("【页面上下文】\n").append(truncated).append("\n\n");
        }

        sb.append("请分析以上问题，输出规划JSON。");
        return sb.toString();
    }

    private PlanResult parsePlanResult(String content) {
        try {
            String json = extractJson(content);
            if (json == null) return PlanResult.skip("无法提取JSON");

            Map<String, Object> map = MAPPER.readValue(json, new TypeReference<>() {});

            int complexityScore = getInt(map, "complexityScore", 0);
            boolean needsPlan = getBool(map, "needsPlan", false);

            if (!needsPlan) {
                return PlanResult.skip("LLM判断无需规划");
            }

            AgentPlan plan = new AgentPlan();
            plan.setGoal(String.valueOf(map.getOrDefault("goal", "")));
            plan.setExpectedOutcome(String.valueOf(map.getOrDefault("expectedOutcome", "")));

            @SuppressWarnings("unchecked")
            List<String> riskWarnings = (List<String>) map.getOrDefault("riskWarnings", List.of());
            plan.setRiskWarnings(riskWarnings);

            String riskLevel = String.valueOf(map.getOrDefault("riskLevel", "low"));
            plan.setRequiresVerification("high".equals(riskLevel) || "critical".equals(riskLevel));

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> stepsRaw = (List<Map<String, Object>>) map.getOrDefault("steps", List.of());
            List<AgentPlan.PlanStep> steps = new ArrayList<>();

            for (Map<String, Object> stepRaw : stepsRaw) {
                AgentPlan.PlanStep step = new AgentPlan.PlanStep();
                step.setOrder(getInt(stepRaw, "order", steps.size() + 1));
                step.setAction(String.valueOf(stepRaw.getOrDefault("action", "")));
                step.setToolName(String.valueOf(stepRaw.getOrDefault("toolName", null)));
                if ("null".equals(step.getToolName())) step.setToolName(null);
                step.setRationale(String.valueOf(stepRaw.getOrDefault("rationale", "")));
                step.setExpectedOutput(String.valueOf(stepRaw.getOrDefault("expectedOutput", "")));

                @SuppressWarnings("unchecked")
                List<String> vc = (List<String>) stepRaw.getOrDefault("verificationCriteria", List.of());
                step.setVerificationCriteria(vc);

                steps.add(step);
            }

            plan.setSteps(steps);

            PlanResult result = new PlanResult(plan, complexityScore, false);
            result.setRiskLevel(riskLevel);
            return result;

        } catch (Exception e) {
            log.warn("[PlanningEngine] 解析规划结果失败: {}", e.getMessage());
            return PlanResult.skip("解析失败: " + e.getMessage());
        }
    }

    private String extractJson(String content) {
        if (content == null) return null;
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return content.substring(start, end + 1);
        }
        return null;
    }

    private int getInt(Map<String, Object> map, String key, int defaultValue) {
        Object v = map.get(key);
        if (v instanceof Number) return ((Number) v).intValue();
        return defaultValue;
    }

    private boolean getBool(Map<String, Object> map, String key, boolean defaultValue) {
        Object v = map.get(key);
        if (v instanceof Boolean) return (Boolean) v;
        return defaultValue;
    }

    public static class PlanResult {
        private final AgentPlan plan;
        private final int complexityScore;
        private final boolean skip;
        private final String skipReason;
        private String riskLevel;
        private String rawPlanContent;

        public PlanResult(AgentPlan plan, int complexityScore, boolean skip) {
            this.plan = plan;
            this.complexityScore = complexityScore;
            this.skip = skip;
            this.skipReason = null;
        }

        private PlanResult(String skipReason) {
            this.plan = null;
            this.complexityScore = 0;
            this.skip = true;
            this.skipReason = skipReason;
        }

        public static PlanResult skip(String reason) {
            return new PlanResult(reason);
        }

        public AgentPlan getPlan() { return plan; }
        public int getComplexityScore() { return complexityScore; }
        public boolean isSkip() { return skip; }
        public String getSkipReason() { return skipReason; }
        public String getRiskLevel() { return riskLevel; }
        public void setRiskLevel(String riskLevel) { this.riskLevel = riskLevel; }
        public String getRawPlanContent() { return rawPlanContent; }
        public void setRawPlanContent(String rawPlanContent) { this.rawPlanContent = rawPlanContent; }

        public String toPromptInjection() {
            if (plan == null) return "";

            StringBuilder sb = new StringBuilder();
            sb.append("\n## 执行计划 (系统自动生成)\n");
            sb.append("目标: ").append(plan.getGoal()).append("\n");

            if (plan.getRiskWarnings() != null && !plan.getRiskWarnings().isEmpty()) {
                sb.append("⚠️ 风险提示:\n");
                for (String w : plan.getRiskWarnings()) {
                    sb.append("  - ").append(w).append("\n");
                }
            }

            sb.append("执行步骤:\n");
            for (AgentPlan.PlanStep step : plan.getSteps()) {
                sb.append(step.getOrder()).append(". ").append(step.getAction());
                if (step.getToolName() != null) {
                    sb.append(" → 调用工具: ").append(step.getToolName());
                }
                sb.append("\n");
            }

            if (plan.getExpectedOutcome() != null && !plan.getExpectedOutcome().isBlank()) {
                sb.append("预期结果: ").append(plan.getExpectedOutcome()).append("\n");
            }

            sb.append("请按照上述计划逐步执行。每完成一步后检查结果是否符合预期，不符合则调整。");
            return sb.toString();
        }
    }
}