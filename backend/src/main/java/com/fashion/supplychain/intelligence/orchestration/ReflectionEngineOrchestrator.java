package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.entity.DecisionMemory;
import java.util.List;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 自我反思引擎编排器 — Hybrid Graph MAS 第二节点（Reflect-Critique）。
 *
 * <p>职责：对 SupervisorAgent 的决策进行批判性分析，输出置信分 + 优化建议，
 * 并将反思结果持久化到 IntelligenceMemory（长期记忆库）。</p>
 *
 * <p>调用方：MultiAgentGraphOrchestrator，不直接暴露 HTTP 端点。</p>
 */
@Slf4j
@Service
public class ReflectionEngineOrchestrator {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final String SYS_PROMPT =
        "你是服装供应链AI反思专家。请对以下决策进行严格的批判性分析。\n" +
        "要求：\n" +
        "1. 多假设验证：生成至少2个替代方案，与当前方案比较优劣\n" +
        "2. 反事实推理：如果采取替代方案，结果可能怎样\n" +
        "3. 历史类比：过去有没有类似的决策？结果如何\n" +
        "4. 二阶效应：当前方案的直接后果是什么？间接后果呢\n" +
        "5. 最坏情况：如果一切出错，最坏的结果是什么\n" +
        "必须用JSON格式输出，包含字段：" +
        "issues（问题点，字符串数组）、suggestion（优化建议，字符串）、" +
        "alternatives（替代方案数组，每个含plan/pros/cons/worstCase）、" +
        "confidence（置信分0-100，整数）。";

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private IntelligenceMemoryOrchestrator memoryOrchestrator;

    @Autowired
    private DecisionChainOrchestrator decisionChainOrchestrator;

    /**
     * 对 AgentState 执行批判性反思，更新 reflection / confidenceScore / optimizationSuggestion。
     */
    public AgentState critiqueAndReflect(AgentState state) {
        long start = System.currentTimeMillis();
        try {
            var result = inferenceOrchestrator.chat(
                "graph-reflection", SYS_PROMPT, buildUserMessage(state));

            String critique = result.isSuccess() ? result.getContent() : buildFallback(state);
            state.setReflection(critique);
            state.setConfidenceScore(parseConfidence(critique, state));
            state.setOptimizationSuggestion(parseSuggestion(critique));

            String crossRef = crossReferenceHistory(state);
            if (crossRef != null && !crossRef.isBlank()) {
                state.setOptimizationSuggestion(
                    state.getOptimizationSuggestion() + "\n[历史比对] " + crossRef);
            }

            if (state.getConfidenceScore() < 80) {
                critique = iterativeReflect(state, critique);
                state.setReflection(critique);
                state.setConfidenceScore(parseConfidence(critique, state));
                state.setOptimizationSuggestion(parseSuggestion(critique));
            }

            persistMemory(state);

        } catch (Exception e) {
            log.warn("[ReflectionEngine] 反思异常，降级: {}", e.getMessage());
            state.setReflection(buildFallback(state));
            state.setConfidenceScore(estimateFallbackConfidence(state));
        }
        log.info("[ReflectionEngine] 租户={} 场景={} 置信={} 耗时={}ms",
            state.getTenantId(), state.getScene(),
            state.getConfidenceScore(), System.currentTimeMillis() - start);
        return state;
    }

    private String iterativeReflect(AgentState state, String firstCritique) {
        try {
            String refinePrompt = "基于第一轮反思结果，请进一步深入分析：\n" +
                "1. 第一轮发现的问题中，哪些是最关键的？\n" +
                "2. 替代方案中哪个最优？为什么？\n" +
                "3. 如果置信分仍低于80，说明什么？还需要什么信息？\n" +
                "4. 给出最终推荐方案和执行步骤。\n\n" +
                "第一轮反思：" + (firstCritique.length() > 500 ? firstCritique.substring(0, 500) : firstCritique);
            var result = inferenceOrchestrator.chat("graph-reflection-iter2", SYS_PROMPT, refinePrompt);
            if (result.isSuccess() && result.getContent() != null && !result.getContent().isBlank()) {
                log.info("[ReflectionEngine] 第二轮迭代反思完成，置信分从{}提升", state.getConfidenceScore());
                return result.getContent();
            }
        } catch (Exception e) {
            log.warn("[ReflectionEngine] 迭代反思失败，使用第一轮结果: {}", e.getMessage());
        }
        return firstCritique;
    }

    // ── private helpers ────────────────────────────────────────────────────

    /**
     * 横向比对历史决策教训 — 从同租户、同类型的已提炼教训中找相似经验。
     */
    private String crossReferenceHistory(AgentState state) {
        try {
            String decisionType = mapSceneToType(state.getScene());
            List<DecisionMemory> history = decisionChainOrchestrator
                    .recallSimilarDecisions(state.getTenantId(), decisionType, 3);
            if (history.isEmpty()) return null;

            String lessons = history.stream()
                    .map(dm -> String.format("- [评分%d] %s", dm.getOutcomeScore(), dm.getLessonLearned()))
                    .collect(Collectors.joining("\n"));
            return String.format("同类型历史%d条教训：\n%s", history.size(), lessons);
        } catch (Exception e) {
            log.debug("[ReflectionEngine] 横向比对降级: {}", e.getMessage());
            return null;
        }
    }

    private String mapSceneToType(String scene) {
        if (scene == null) return "delivery";
        return switch (scene) {
            case "delivery_risk" -> "delivery";
            case "sourcing" -> "sourcing";
            case "compliance" -> "quality";
            default -> "delivery";
        };
    }

    private String buildUserMessage(AgentState state) {
        int orderCount = state.getOrderIds() == null ? 0 : state.getOrderIds().size();
        return String.format(
            "决策摘要：%s\n路由：%s\n场景：%s\n进度率：%.1f%%\n风险分：%.1f\n知识匹配：%.1f\n订单数：%d",
            state.getContextSummary(), state.getRoute(), state.getScene(),
            state.getProgressRate(), state.getRiskScore(), state.getKnowledgeMatch(), orderCount);
    }

    private int parseConfidence(String critique, AgentState state) {
        try {
            int v = JSON.readTree(critique).path("confidence").asInt(-1);
            if (v >= 0 && v <= 100) return v;
        } catch (Exception ex) {
            log.debug("[ReflectionEngine] 置信度解析失败: {}", ex.getMessage());
        }
        return estimateFallbackConfidence(state);
    }

    private String parseSuggestion(String critique) {
        try {
            String s = JSON.readTree(critique).path("suggestion").asText("");
            return s.isBlank() ? "暂无优化建议" : s;
        } catch (Exception e) {
            if (critique == null || critique.isBlank()) return "暂无优化建议";
            return critique.length() > 200 ? critique.substring(0, 200) : critique;
        }
    }

    private int estimateFallbackConfidence(AgentState state) {
        double v = state.getProgressRate() * 0.4
            + (100 - state.getRiskScore()) * 0.3
            + state.getKnowledgeMatch() * 0.3;
        return Math.min(100, Math.max(0, (int) v));
    }

    private String buildFallback(AgentState state) {
        return String.format(
            "{\"issues\":\"LLM暂不可达\",\"suggestion\":\"建议人工复核订单风险\",\"confidence\":%d}",
            estimateFallbackConfidence(state));
    }

    private void persistMemory(AgentState state) {
        try {
            memoryOrchestrator.saveCase(
                "graph_reflection", "multi_agent",
                "MAS反思 场景=" + state.getScene() + " 置信=" + state.getConfidenceScore(),
                state.toJson());
        } catch (Exception e) {
            log.warn("[ReflectionEngine] 记忆持久化失败（降级忽略）: {}", e.getMessage());
        }
    }
}
