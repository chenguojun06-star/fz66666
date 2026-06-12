package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * TaskDecompositionEngine — 复杂任务分解引擎（2026年最佳实践）
 *
 * <p>将复杂问题分解为可验证的子任务，每个子任务都有：
 * 1. 清晰的描述
 * 2. 预期输出
 * 3. 验证标准
 *
 * <p>这是Chain-of-Thought推理的关键组件，解决长程规划能力不足的问题。
 */
@Slf4j
@Component
@Lazy
public class TaskDecompositionEngine {

    @Autowired
    private AiInferenceGateway inferenceGateway;

    @Value("${xiaoyun.decomposition.enabled:true}")
    private boolean decompositionEnabled;

    @Value("${xiaoyun.decomposition.minComplexity:50}")
    private int minComplexityThreshold;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String DECOMPOSITION_PROMPT = """
你是一个任务分解专家。请将用户的复杂问题分解为多个可独立执行的子任务。

## 分解原则：
1. 每个子任务应该是可独立完成的
2. 子任务之间应该有清晰的顺序依赖
3. 每个子任务都应该有明确的预期输出
4. 每个子任务都应该有可验证的完成标准
5. 子任务数量控制在3-8个之间

## 输出格式（严格JSON）：
{
  "overallGoal": "对原问题的一句话概括",
  "subTasks": [
    {
      "order": 1,
      "description": "子任务描述",
      "expectedOutput": "预期输出内容",
      "verificationCriteria": "如何验证这个子任务已完成"
    }
  ],
  "dependencies": {
    "2": ["1"],
    "3": ["2"]
  },
  "notes": "其他注意事项"
}

## 特别注意：
- 不要编造不存在的工具
- 分解要考虑实际执行的可行性
- 复杂查询先分解，再逐步执行
""";

    /**
     * 判断是否需要分解任务
     */
    public boolean needsDecomposition(String userMessage) {
        if (!decompositionEnabled) {
            return false;
        }
        int complexity = estimateComplexity(userMessage);
        return complexity >= minComplexityThreshold;
    }

    /**
     * 执行任务分解
     */
    public DecompositionResult decompose(String userMessage, String pageContext) {
        log.info("[TaskDecomposition] 开始分解任务...");

        try {
            String systemPrompt = DECOMPOSITION_PROMPT;
            String userPrompt = buildUserPrompt(userMessage, pageContext);

            List<AiMessage> messages = List.of(
                    AiMessage.system(systemPrompt),
                    AiMessage.user(userPrompt)
            );

            IntelligenceInferenceResult result = inferenceGateway.chat(
                    "task-decomposition", messages, List.of());

            if (!result.isSuccess() || result.getContent() == null) {
                log.warn("[TaskDecomposition] 分解失败: {}", result.getErrorMessage());
                return DecompositionResult.failure("分解失败: " + result.getErrorMessage());
            }

            DecompositionResult decomposition = parseDecomposition(result.getContent());

            if (decomposition.isSuccess()) {
                log.info("[TaskDecomposition] 分解完成: {} 个子任务",
                        decomposition.getSubTasks().size());
            }

            return decomposition;

        } catch (Exception e) {
            log.error("[TaskDecomposition] 分解异常", e);
            return DecompositionResult.failure("分解异常: " + e.getMessage());
        }
    }

    /**
     * 估算问题复杂度
     */
    private int estimateComplexity(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) return 0;

        int score = 0;

        // 长度评分
        if (userMessage.length() > 50) score += 10;
        if (userMessage.length() > 100) score += 10;
        if (userMessage.length() > 200) score += 10;

        // 问题数量
        long questionCount = userMessage.chars()
                .filter(c -> c == '?' || c == '？')
                .count();
        score += Math.min(questionCount * 5, 15);

        // 复杂关键词
        String lower = userMessage.toLowerCase();
        String[] complexKeywords = {
                "分析", "评估", "对比", "比较", "排名", "为什么",
                "怎么处理", "怎么办", "建议", "规划", "优化",
                "所有", "全部", "哪些", "各个", "每个"
        };

        for (String keyword : complexKeywords) {
            if (lower.contains(keyword)) {
                score += 10;
            }
        }

        // 风险关键词
        String[] riskKeywords = {
                "逾期", "风险", "异常", "损失", "紧急", "危机",
                "转厂", "关闭", "结算", "审批", "删除", "变更"
        };

        for (String keyword : riskKeywords) {
            if (lower.contains(keyword)) {
                score += 10;
            }
        }

        return Math.min(score, 100);
    }

    /**
     * 构建用户提示
     */
    private String buildUserPrompt(String userMessage, String pageContext) {
        StringBuilder sb = new StringBuilder();
        sb.append("【用户问题】\n").append(userMessage).append("\n\n");

        if (pageContext != null && !pageContext.isBlank()) {
            String truncated = pageContext.length() > 500
                    ? pageContext.substring(0, 500) + "..."
                    : pageContext;
            sb.append("【页面上下文】\n").append(truncated).append("\n\n");
        }

        sb.append("请将上述问题分解为可执行的子任务，输出JSON。");
        return sb.toString();
    }

    /**
     * 解析分解结果
     */
    private DecompositionResult parseDecomposition(String content) {
        try {
            String json = extractJson(content);
            if (json == null) {
                return DecompositionResult.failure("无法提取JSON");
            }

            Map<String, Object> map = MAPPER.readValue(json, new TypeReference<>() {});

            String overallGoal = String.valueOf(map.getOrDefault("overallGoal", ""));
            String notes = String.valueOf(map.getOrDefault("notes", ""));

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> subTasksRaw =
                    (List<Map<String, Object>>) map.getOrDefault("subTasks", List.of());

            List<SubTask> subTasks = new ArrayList<>();
            int order = 1;
            for (Map<String, Object> raw : subTasksRaw) {
                String description = String.valueOf(raw.getOrDefault("description", ""));
                String expectedOutput = String.valueOf(raw.getOrDefault("expectedOutput", ""));
                String verificationCriteria = String.valueOf(raw.getOrDefault("verificationCriteria", ""));

                int taskOrder = getInt(raw, "order", order++);

                subTasks.add(new SubTask(taskOrder, description, expectedOutput, verificationCriteria));
            }

            if (subTasks.isEmpty()) {
                return DecompositionResult.failure("没有子任务");
            }

            return DecompositionResult.success(overallGoal, subTasks, notes);

        } catch (Exception e) {
            log.warn("[TaskDecomposition] 解析失败: {}", e.getMessage());
            return DecompositionResult.failure("解析失败: " + e.getMessage());
        }
    }

    /**
     * 提取JSON
     */
    private String extractJson(String content) {
        if (content == null) return null;
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return content.substring(start, end + 1);
        }
        return null;
    }

    /**
     * 获取int值
     */
    private int getInt(Map<String, Object> map, String key, int defaultValue) {
        Object v = map.get(key);
        if (v instanceof Number) return ((Number) v).intValue();
        try {
            if (v instanceof String) return Integer.parseInt((String) v);
        } catch (Exception e) {
            // ignore
        }
        return defaultValue;
    }

    // ===== 内部类 =====

    /**
     * 任务分解结果
     */
    public static class DecompositionResult {
        private final boolean success;
        private final String errorMessage;
        private final String overallGoal;
        private final List<SubTask> subTasks;
        private final String notes;

        private DecompositionResult(boolean success, String errorMessage,
                                      String overallGoal, List<SubTask> subTasks,
                                      String notes) {
            this.success = success;
            this.errorMessage = errorMessage;
            this.overallGoal = overallGoal;
            this.subTasks = subTasks;
            this.notes = notes;
        }

        public static DecompositionResult success(String overallGoal,
                                                   List<SubTask> subTasks,
                                                   String notes) {
            return new DecompositionResult(true, null, overallGoal, subTasks, notes);
        }

        public static DecompositionResult failure(String errorMessage) {
            return new DecompositionResult(false, errorMessage, null, List.of(), null);
        }

        public boolean isSuccess() { return success; }
        public String getErrorMessage() { return errorMessage; }
        public String getOverallGoal() { return overallGoal; }
        public List<SubTask> getSubTasks() { return subTasks; }
        public String getNotes() { return notes; }
    }

    /**
     * 子任务
     */
    public record SubTask(int order, String description,
                           String expectedOutput, String verificationCriteria) {}
}
