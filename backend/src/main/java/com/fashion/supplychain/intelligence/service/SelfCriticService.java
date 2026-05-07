package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.AgentExecutionMetrics;
import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackRecord;
import com.fashion.supplychain.intelligence.mapper.IntelligenceFeedbackRecordMapper;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceMemoryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 自我批评服务 —— 无需用户反馈，系统自动评估每次对话质量并生成内部反馈。
 *
 * <p>核心机制：每次Agent循环结束后，基于以下维度自动评分：
 * <ul>
 *   <li>数据真实性：回答中引用的数据是否与工具返回一致</li>
 *   <li>工具使用效率：是否调用了不必要的工具、是否遗漏关键工具</li>
 *   <li>回答完整性：是否回答了用户的全部问题</li>
 *   <li>幻觉检测：是否包含模型编造的信息</li>
 *   <li>上下文利用：是否充分利用了系统提示词中的上下文</li>
 * </ul>
 *
 * <p>评分低于阈值时，自动生成反馈记录并触发实时学习闭环。</p>
 */
@Service
@Slf4j
public class SelfCriticService {

    /** 自动反馈的阈值：综合评分低于此值时触发自我改进 */
    private static final double SELF_IMPROVE_THRESHOLD = 75.0;
    /** 幻觉检测：回答中包含数字但工具返回无数字时扣分 */
    private static final double HALLUCINATION_PENALTY = 20.0;
    /** 数据不一致惩罚 */
    private static final double DATA_MISMATCH_PENALTY = 25.0;
    /** 工具遗漏惩罚 */
    private static final double TOOL_OMISSION_PENALTY = 15.0;

    @Autowired
    private IntelligenceFeedbackRecordMapper feedbackMapper;

    @Autowired
    private IntelligenceMemoryOrchestrator memoryOrchestrator;

    @Autowired
    private AiAgentMetricsService metricsService;

    @Autowired(required = false)
    private AiAdvisorService aiAdvisorService;

    // ──────────────────────────────────────────────────────────────

    /**
     * 执行自我批评评估（异步，不阻塞主流程）。
     *
     * @param sessionId      会话ID
     * @param userMessage    用户原始问题
     * @param aiResponse     AI最终回答
     * @param toolCalls      本次调用的工具列表
     * @param toolResults    工具返回的原始结果（JSON字符串）
     * @param metrics        执行指标（耗时、token数、迭代轮数等）
     * @param usedQuickPath  是否使用了快速通道
     */
    @Async("aiSelfCriticExecutor")
    public void critique(
            String sessionId,
            String userMessage,
            String aiResponse,
            List<AgentTool> toolCalls,
            List<String> toolResults,
            AgentExecutionMetrics metrics,
            boolean usedQuickPath) {

        try {
            long start = System.currentTimeMillis();

            // 1. 多维度自动评分
            double dataAccuracyScore = evaluateDataAccuracy(aiResponse, toolResults);
            double toolEfficiencyScore = evaluateToolEfficiency(userMessage, toolCalls, usedQuickPath);
            double completenessScore = evaluateCompleteness(userMessage, aiResponse);
            double hallucinationScore = evaluateHallucination(aiResponse, toolResults);
            double contextUtilizationScore = evaluateContextUtilization(aiResponse, metrics);

            double overallScore = (dataAccuracyScore * 0.30
                    + toolEfficiencyScore * 0.25
                    + completenessScore * 0.20
                    + hallucinationScore * 0.15
                    + contextUtilizationScore * 0.10);

            // 2. 生成批评报告
            String critiqueReport = buildCritiqueReport(
                    dataAccuracyScore, toolEfficiencyScore, completenessScore,
                    hallucinationScore, contextUtilizationScore, overallScore,
                    userMessage, aiResponse, toolCalls, usedQuickPath);

            // 3. 低分自动沉淀反馈
            if (overallScore < SELF_IMPROVE_THRESHOLD) {
                autoSaveFeedback(sessionId, userMessage, aiResponse, overallScore, critiqueReport, usedQuickPath);
            }

            // 4. 无论分数高低，都保存执行快照到记忆系统（用于后续模式挖掘）
            saveExecutionSnapshot(sessionId, userMessage, aiResponse, overallScore, metrics, usedQuickPath);

            log.info("[SelfCritic] session={} score={:.1f} quickPath={} tools={}耗时={}ms",
                    sessionId, overallScore, usedQuickPath,
                    toolCalls == null ? 0 : toolCalls.size(),
                    System.currentTimeMillis() - start);

        } catch (Exception e) {
            log.warn("[SelfCritic] 自我批评失败（非关键）session={}: {}", sessionId, e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────
    // 评分维度实现

    /**
     * 数据真实性评分：比对回答中的数字与工具返回中的数字。
     */
    private double evaluateDataAccuracy(String aiResponse, List<String> toolResults) {
        if (toolResults == null || toolResults.isEmpty()) {
            // 无工具调用时，如果回答包含具体数字，可能为幻觉
            return containsSpecificNumbers(aiResponse) ? 40.0 : 80.0;
        }

        String combinedResults = String.join(" ", toolResults);
        List<String> responseNumbers = extractNumbers(aiResponse);
        List<String> resultNumbers = extractNumbers(combinedResults);

        if (responseNumbers.isEmpty()) return 85.0; // 回答无数字，不惩罚

        int matched = 0;
        for (String num : responseNumbers) {
            if (resultNumbers.contains(num)) {
                matched++;
            }
        }

        double ratio = responseNumbers.isEmpty() ? 1.0 : (double) matched / responseNumbers.size();
        return Math.min(100, ratio * 100 + (1 - ratio) * 30); // 部分匹配也给基础分
    }

    /**
     * 工具使用效率评分：评估工具选择是否合理。
     */
    private double evaluateToolEfficiency(String userMessage, List<AgentTool> toolCalls, boolean usedQuickPath) {
        if (usedQuickPath) {
            // 快速通道：如果问题明显需要数据查询但无工具调用，扣分
            boolean needsData = impliesDataNeed(userMessage);
            return needsData ? 30.0 : 85.0;
        }

        if (toolCalls == null || toolCalls.isEmpty()) return 50.0;

        // 检查是否有冗余工具调用
        long distinctTools = toolCalls.stream().map(AgentTool::getName).distinct().count();
        boolean hasRedundancy = distinctTools < toolCalls.size();

        // 检查是否遗漏关键工具（基于关键词匹配）
        boolean likelyOmitted = checkLikelyOmittedTools(userMessage, toolCalls);

        double score = 85.0;
        if (hasRedundancy) score -= 10.0;
        if (likelyOmitted) score -= TOOL_OMISSION_PENALTY;

        return Math.max(0, score);
    }

    /**
     * 回答完整性评分：检查是否回答了用户的全部问题。
     */
    private double evaluateCompleteness(String userMessage, String aiResponse) {
        // 提取用户问题中的疑问词和关键实体
        List<String> questionEntities = extractQuestionEntities(userMessage);

        if (questionEntities.isEmpty()) return 80.0; // 非问题式输入

        int addressed = 0;
        String lowerResponse = aiResponse.toLowerCase();
        for (String entity : questionEntities) {
            if (lowerResponse.contains(entity.toLowerCase()) ||
                isAddressedImplicitly(entity, aiResponse)) {
                addressed++;
            }
        }

        double ratio = questionEntities.isEmpty() ? 1.0 : (double) addressed / questionEntities.size();
        return ratio * 100;
    }

    /**
     * 幻觉检测评分：识别模型编造的信息。
     */
    private double evaluateHallucination(String aiResponse, List<String> toolResults) {
        double penalty = 0;

        // 检测1：回答包含具体数字但工具无返回
        if ((toolResults == null || toolResults.isEmpty() || allResultsEmpty(toolResults))
                && containsSpecificNumbers(aiResponse)) {
            penalty += HALLUCINATION_PENALTY;
        }

        // 检测2：包含"据我所知"、"我认为"等模糊表述（无数据支撑时）
        if (hasVagueClaims(aiResponse) && (toolResults == null || toolResults.isEmpty())) {
            penalty += 10.0;
        }

        // 检测3：时间表述与当前时间矛盾（简化检测）
        if (hasTemporalContradiction(aiResponse)) {
            penalty += 15.0;
        }

        return Math.max(0, 100 - penalty);
    }

    /**
     * 上下文利用评分：检查是否利用了系统提供的上下文信息。
     */
    private double evaluateContextUtilization(String aiResponse, AgentExecutionMetrics metrics) {
        double score = 70.0; // 基础分

        // 如果使用了页面上下文，加分
        if (metrics != null && metrics.getPageContext() != null && !metrics.getPageContext().isBlank()) {
            score += 15.0;
        }

        // 如果使用了历史对话，加分
        if (metrics != null && metrics.getHistoryTurns() > 0) {
            score += 10.0;
        }

        // 如果迭代轮数合理（非过少也非过多），加分
        if (metrics != null) {
            int iterations = metrics.getIterations();
            if (iterations >= 2 && iterations <= 6) {
                score += 5.0;
            } else if (iterations > 8) {
                score -= 10.0; // 过度思考
            }
        }

        return Math.min(100, score);
    }

    // ──────────────────────────────────────────────────────────────
    // 辅助方法

    private void autoSaveFeedback(String sessionId, String userMessage, String aiResponse,
                                   double score, String critiqueReport, boolean usedQuickPath) {
        try {
            Long tenantId = UserContext.tenantId();
            IntelligenceFeedbackRecord feedback = new IntelligenceFeedbackRecord();
            feedback.setTenantId(tenantId != null ? tenantId : 0L);
            feedback.setPredictionId(truncate(sessionId, 100));
            feedback.setSuggestionType(truncate(usedQuickPath ? "quick_path_quality" : "agent_loop_quality", 100));
            feedback.setSuggestionContent(aiResponse.length() > 500 ? aiResponse.substring(0, 500) : aiResponse);
            feedback.setFeedbackResult("rejected"); // 自我批评视为"拒绝"
                feedback.setFeedbackReason(truncate(
                    String.format("[自动评估] 综合评分%.1f/100。问题：%s",
                        score, critiqueReport.length() > 300 ? critiqueReport.substring(0, 300) : critiqueReport),
                    500));
            feedback.setFeedbackAnalysis(critiqueReport);
            feedback.setDeviationMinutes((long) (100 - score)); // 用偏差分记录差距
            feedback.setCreateTime(LocalDateTime.now());
            feedback.setUpdateTime(LocalDateTime.now());

            feedbackMapper.insert(feedback);

            log.info("[SelfCritic] 低分反馈已自动沉淀 session={} score={:.1f}", sessionId, score);
        } catch (Exception e) {
            log.warn("[SelfCritic] 自动保存反馈失败: {}", e.getMessage());
        }
    }

    private void saveExecutionSnapshot(String sessionId, String userMessage, String aiResponse,
                                        double score, AgentExecutionMetrics metrics, boolean usedQuickPath) {
        try {
            String snapshot = String.format(
                    "Session=%s | Score=%.1f | QuickPath=%s | Iterations=%d | Tools=%d | Tokens=%d | Duration=%dms\n" +
                    "User: %s\nAI: %s",
                    sessionId, score, usedQuickPath,
                    metrics == null ? 0 : metrics.getIterations(),
                    metrics == null ? 0 : metrics.getToolCallCount(),
                    metrics == null ? 0 : metrics.getTokenUsed(),
                    metrics == null ? 0 : metrics.getDurationMs(),
                    userMessage.length() > 200 ? userMessage.substring(0, 200) : userMessage,
                    aiResponse.length() > 300 ? aiResponse.substring(0, 300) : aiResponse);

            memoryOrchestrator.saveCase(
                    "execution_snapshot",
                    usedQuickPath ? "quick_path" : "agent_loop",
                    String.format("执行快照 score=%.0f %s", score, usedQuickPath ? "[快速通道]" : ""),
                    snapshot);
        } catch (Exception e) {
            log.debug("[SelfCritic] 执行快照保存失败（非关键）: {}", e.getMessage());
        }
    }

    private String buildCritiqueReport(double dataAcc, double toolEff, double complete,
                                        double hallucination, double contextUtil, double overall,
                                        String userMessage, String aiResponse,
                                        List<AgentTool> toolCalls, boolean usedQuickPath) {
        StringBuilder sb = new StringBuilder();
        sb.append(String.format("综合评分: %.1f/100 | ", overall));
        sb.append(String.format("数据真实性: %.0f | ", dataAcc));
        sb.append(String.format("工具效率: %.0f | ", toolEff));
        sb.append(String.format("完整性: %.0f | ", complete));
        sb.append(String.format("幻觉控制: %.0f | ", hallucination));
        sb.append(String.format("上下文利用: %.0f | ", contextUtil));
        sb.append(String.format("快速通道: %s | ", usedQuickPath ? "是" : "否"));
        sb.append(String.format("工具数: %d", toolCalls == null ? 0 : toolCalls.size()));

        if (overall < SELF_IMPROVE_THRESHOLD) {
            sb.append(" | 主要问题: ");
            if (dataAcc < 70) sb.append("数据准确性不足 ");
            if (toolEff < 70) sb.append("工具使用不当 ");
            if (complete < 70) sb.append("回答不完整 ");
            if (hallucination < 70) sb.append("存在幻觉风险 ");
            if (contextUtil < 70) sb.append("上下文利用不充分 ");
        }

        return sb.toString();
    }

    // ── 工具方法 ─────────────────────────────────────────────────────

    private static final Pattern NUMBER_PATTERN = Pattern.compile("\\b\\d+(?:\\.\\d+)?(?:%|件|件|元|万|天|小时|分钟)?\\b");

    private List<String> extractNumbers(String text) {
        if (text == null) return List.of();
        return NUMBER_PATTERN.matcher(text).results()
                .map(m -> m.group().replaceAll("[%件元万天小时分钟]", ""))
                .distinct()
                .toList();
    }

    private boolean containsSpecificNumbers(String text) {
        return text != null && NUMBER_PATTERN.matcher(text).find();
    }

    private boolean allResultsEmpty(List<String> results) {
        return results.stream().allMatch(r -> r == null || r.isBlank() || r.equals("[]") || r.equals("{}"));
    }

    private boolean impliesDataNeed(String message) {
        if (message == null) return false;
        String lower = message.toLowerCase();
        return lower.matches(".*(多少|几|查询|查一下|统计|汇总|排名|对比|分析|趋势|为什么|怎么回事|什么时候|在哪里).*");
    }

    private boolean checkLikelyOmittedTools(String message, List<AgentTool> toolCalls) {
        if (message == null || toolCalls == null) return false;
        String lower = message.toLowerCase();
        // 如果用户问订单相关但没有调用订单工具
        if (lower.contains("订单") && toolCalls.stream().noneMatch(t -> t.getName().toLowerCase().contains("order"))) {
            return true;
        }
        // 如果用户问库存相关但没有调用库存工具
        if ((lower.contains("库存") || lower.contains("仓库")) &&
                toolCalls.stream().noneMatch(t -> t.getName().toLowerCase().contains("stock") || t.getName().toLowerCase().contains("warehouse"))) {
            return true;
        }
        return false;
    }

    private List<String> extractQuestionEntities(String message) {
        if (message == null) return List.of();
        // 简单实现：提取名词短语（以"的"、"了"、"吗"等分隔）
        String[] parts = message.split("[的了吗呢啊吧]|(怎么)|(什么)|(哪些)|(为什么)|(多少)");
        return java.util.Arrays.stream(parts)
                .map(String::trim)
                .filter(s -> s.length() >= 2)
                .distinct()
                .limit(5)
                .toList();
    }

    private boolean isAddressedImplicitly(String entity, String response) {
        // 简化：如果实体是"订单"，回答中有"单"也算匹配
        if (entity.contains("订单") && response.contains("单")) return true;
        if (entity.contains("工厂") && response.contains("厂")) return true;
        if (entity.contains("工人") && response.contains("员工")) return true;
        return false;
    }

    private boolean hasVagueClaims(String text) {
        if (text == null) return false;
        String lower = text.toLowerCase();
        return lower.contains("据我所知") || lower.contains("我认为") || lower.contains("可能")
                || lower.contains("大概") || lower.contains("应该") || lower.contains("估计");
    }

    private boolean hasTemporalContradiction(String text) {
        // 简化检测：如果提到"昨天"但当前不是合理时间（需要更复杂的NLP）
        // 这里仅做示例性检测
        return false;
    }

    private String truncate(String value, int maxLen) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() <= maxLen) {
            return trimmed;
        }
        return trimmed.substring(0, maxLen);
    }
}
