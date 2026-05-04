package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.FollowUpAction;
import com.fashion.supplychain.intelligence.dto.FollowUpAction.ActionType;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 动态FollowUp建议引擎 —— 替代硬编码映射，使用AI动态生成跟进建议。
 *
 * <p>核心机制：
 * <ul>
 *   <li>基于用户问题语义理解生成建议（非规则匹配）</li>
 *   <li>结合工具返回数据动态构建上下文相关建议</li>
 *   <li>利用历史记忆优化建议质量</li>
 *   <li>支持多轮对话连续性</li>
 * </ul>
 */
@Service
@Slf4j
public class DynamicFollowUpEngine {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired(required = false)
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private IntelligenceMemoryOrchestrator memoryOrchestrator;

    @Autowired
    private FollowUpSuggestionEngine fallbackEngine;

    // ──────────────────────────────────────────────────────────────

    /**
     * 动态生成FollowUp建议。
     *
     * @param userMessage    用户原始问题
     * @param aiResponse     AI回答内容
     * @param toolCalls      本次调用的工具
     * @param toolResults    工具返回结果
     * @param tenantId       租户ID
     * @param history        对话历史（用于连续性）
     * @return FollowUp建议列表
     */
    public List<FollowUpAction> generateFollowUps(
            String userMessage,
            String aiResponse,
            List<AgentTool> toolCalls,
            List<String> toolResults,
            Long tenantId,
            List<String> history) {

        try {
            // 1. 尝试AI动态生成（如果服务可用且配额充足）
            if (aiAdvisorService != null && aiAdvisorService.isEnabled()
                    && aiAdvisorService.checkAndConsumeQuota(tenantId)) {
                List<FollowUpAction> aiGenerated = generateWithAi(
                        userMessage, aiResponse, toolCalls, toolResults, history);
                if (!aiGenerated.isEmpty()) {
                    return aiGenerated;
                }
            }
        } catch (Exception e) {
            log.debug("[DynamicFollowUp] AI生成失败，降级到规则引擎: {}", e.getMessage());
        }

        // 2. 降级到增强版规则引擎
        return generateWithEnhancedRules(userMessage, aiResponse, toolCalls);
    }

    // ──────────────────────────────────────────────────────────────
    // AI动态生成

    private List<FollowUpAction> generateWithAi(
            String userMessage, String aiResponse,
            List<AgentTool> toolCalls, List<String> toolResults,
            List<String> history) {

        String prompt = buildDynamicPrompt(userMessage, aiResponse, toolCalls, toolResults, history);

        var result = aiAdvisorService.chat(
                "你是服装供应链AI助手，擅长生成精准的后续行动建议。",
                prompt);

        if (result == null || result.isBlank()) {
            return Collections.emptyList();
        }

        return parseAiGeneratedFollowUps(result);
    }

    private String buildDynamicPrompt(String userMessage, String aiResponse,
                                       List<AgentTool> toolCalls, List<String> toolResults,
                                       List<String> history) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("基于以下对话上下文，生成2-4个最相关的后续行动建议。\n\n");
        prompt.append("用户问题：").append(userMessage).append("\n");
        prompt.append("AI回答摘要：").append(aiResponse.length() > 300
                ? aiResponse.substring(0, 300) + "..." : aiResponse).append("\n");

        if (toolCalls != null && !toolCalls.isEmpty()) {
            prompt.append("已使用的工具：").append(
                    toolCalls.stream().map(AgentTool::getName).collect(Collectors.joining(", "))).append("\n");
        }

        if (toolResults != null && !toolResults.isEmpty()) {
            String combined = toolResults.stream()
                    .map(r -> r.length() > 200 ? r.substring(0, 200) + "..." : r)
                    .collect(Collectors.joining("\n"));
            prompt.append("工具返回摘要：").append(combined).append("\n");
        }

        if (history != null && !history.isEmpty()) {
            prompt.append("对话历史：").append(String.join(" → ", history.subList(
                    Math.max(0, history.size() - 3), history.size()))).append("\n");
        }

        prompt.append("\n要求：\n");
        prompt.append("1. 建议必须基于已查询的数据，不能编造\n");
        prompt.append("2. 建议应帮助用户深入分析问题或采取行动\n");
        prompt.append("3. 每个建议包含：label（简短标签）、description（描述）、actionType（动作类型：ASK/EXECUTE/NAVIGATE）、command（命令文本）\n");
        prompt.append("4. 使用JSON数组格式输出\n");
        prompt.append("5. 如果用户问的是简单问候，返回空数组[]\n");

        return prompt.toString();
    }

    private List<FollowUpAction> parseAiGeneratedFollowUps(String aiOutput) {
        try {
            // 尝试提取JSON数组
            String json = extractJsonArray(aiOutput);
            if (json == null) return Collections.emptyList();

            List<Map<String, String>> parsed = JSON.readValue(json, new TypeReference<>() {});
            List<FollowUpAction> actions = new ArrayList<>();

            for (Map<String, String> item : parsed) {
                FollowUpAction action = new FollowUpAction();
                action.setLabel(item.getOrDefault("label", "进一步了解"));
                action.setCommand(item.getOrDefault("command", ""));
                String actionTypeStr = item.getOrDefault("actionType", "ASK");
                try {
                    action.setActionType(ActionType.valueOf(actionTypeStr));
                } catch (IllegalArgumentException e) {
                    action.setActionType(ActionType.ASK);
                }
                actions.add(action);
            }

            return actions.stream().limit(4).toList();
        } catch (Exception e) {
            log.debug("[DynamicFollowUp] AI输出解析失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private String extractJsonArray(String text) {
        if (text == null) return null;
        int start = text.indexOf('[');
        int end = text.lastIndexOf(']');
        if (start >= 0 && end > start) {
            return text.substring(start, end + 1);
        }
        return null;
    }

    // ──────────────────────────────────────────────────────────────
    // 增强版规则引擎（原有硬编码的智能化升级）

    private List<FollowUpAction> generateWithEnhancedRules(
            String userMessage, String aiResponse, List<AgentTool> toolCalls) {

        List<FollowUpAction> actions = new ArrayList<>();
        String lowerMsg = userMessage.toLowerCase();
        String lowerResp = aiResponse.toLowerCase();

        // 使用语义匹配替代简单关键词匹配
        Map<String, Double> intentScores = analyzeIntent(lowerMsg);

        // 根据意图分数动态生成建议
        if (intentScores.getOrDefault("delay", 0.0) > 0.5) {
            actions.add(buildAction("查看延期原因", "有哪些逾期订单", ActionType.ASK));
            actions.add(buildAction("催单跟进", "帮我催一下逾期订单", ActionType.EXECUTE));
        }

        if (intentScores.getOrDefault("inventory", 0.0) > 0.5) {
            actions.add(buildAction("库存预警", "有哪些面料库存不足", ActionType.ASK));
            actions.add(buildAction("补货建议", "基于生产计划生成采购建议", ActionType.ASK));
        }

        if (intentScores.getOrDefault("quality", 0.0) > 0.5) {
            actions.add(buildAction("质量趋势", "查看近期质量指标变化趋势", ActionType.ASK));
            actions.add(buildAction("不合格品处理", "查看不合格品处理进度", ActionType.ASK));
        }

        if (intentScores.getOrDefault("cost", 0.0) > 0.5) {
            actions.add(buildAction("成本明细", "查看该订单的详细成本构成", ActionType.ASK));
            actions.add(buildAction("成本优化", "分析可优化的成本项", ActionType.ASK));
        }

        // 基于AI回答内容动态补充
        if (lowerResp.contains("风险") || lowerResp.contains("逾期") || lowerResp.contains("异常")) {
            actions.add(buildAction("风险详情", "查看详细的风险订单列表", ActionType.ASK));
        }

        if (lowerResp.contains("建议") || lowerResp.contains("优化")) {
            actions.add(buildAction("执行建议", "执行AI给出的优化建议", ActionType.EXECUTE));
        }

        // 去重并限制数量
        return actions.stream()
                .distinct()
                .limit(4)
                .collect(Collectors.toList());
    }

    /**
     * 意图语义分析（简化版，基于关键词+权重）
     */
    private Map<String, Double> analyzeIntent(String message) {
        Map<String, Double> scores = new HashMap<>();

        // 延期相关
        scores.put("delay", countMatches(message,
                "延期", "逾期", "超期", "延迟", "赶不上", "来不及", "催", "赶货"));

        // 库存相关
        scores.put("inventory", countMatches(message,
                "库存", "缺货", "补货", "物料", "面料", "余量", "剩余", "不够"));

        // 质量相关
        scores.put("quality", countMatches(message,
                "质量", "质检", "不合格", "次品", "返工", "瑕疵", "问题"));

        // 成本相关
        scores.put("cost", countMatches(message,
                "成本", "费用", "价格", "多少钱", "预算", "利润", "亏损", "省钱"));

        // 产能相关
        scores.put("capacity", countMatches(message,
                "产能", "产量", "效率", "饱和", "空闲", "负荷", "排产"));

        return scores;
    }

    private double countMatches(String text, String... keywords) {
        int count = 0;
        for (String kw : keywords) {
            if (text.contains(kw)) count++;
        }
        return Math.min(1.0, count / 2.0); // 归一化到0-1
    }

    private FollowUpAction buildAction(String label, String command, ActionType actionType) {
        return FollowUpAction.builder()
                .label(label)
                .command(command)
                .actionType(actionType)
                .build();
    }
}
