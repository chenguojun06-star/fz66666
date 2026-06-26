package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

/**
 * 意图组合引擎：识别一句话中的多个独立意图，并行处理，合并结果。
 * <p>
 * 典型场景：
 * <ul>
 *   <li>"帮我查一下订单A的进度，顺便看看工厂B的产能"</li>
 *   <li>"分析一下本月延期情况，还有工资结算得怎么样了"</li>
 *   <li>"看看面料库存够不够，再帮我算一下成本"</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
public class IntentCompositionService {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Value("${xiaoyun.intent-composition.enabled:true}")
    private boolean enabled;

    @Value("${xiaoyun.intent-composition.max-parallel:3}")
    private int maxParallel;

    @Value("${xiaoyun.intent-composition.min-intent-length:4}")
    private int minIntentLength;

    private static final String INTENT_SPLIT_PROMPT = """
            分析用户消息，判断是否包含多个独立的意图或问题。
            如果包含多个独立意图，请拆分出来，每个意图一行，格式：INTENT_N=xxx
            如果只有一个意图，返回：SINGLE=true
            
            注意：
            1. 只有当意图之间可以独立回答、互不依赖时才算多意图
            2. 同一个主题的不同方面算一个意图（如"分析订单延期原因和影响"算一个意图）
            3. 最多拆分出3个意图
            
            用户消息：%s
            """;

    private static final List<String> SPLIT_PATTERNS = List.of(
            "，顺便", "，还有", "，另外", "，再", "，帮我",
            "。顺便", "。还有", "。另外", "。再", "。帮我",
            "；顺便", "；还有", "；另外", "；再", "；帮我",
            "同时", "以及", "并且", "还有就是"
    );

    private ExecutorService executorService;

    public IntentCompositionService() {
        this.executorService = Executors.newFixedThreadPool(3, r -> {
            Thread t = new Thread(r, "intent-composition-%d");
            t.setDaemon(true);
            return t;
        });
    }

    /**
     * 检测用户消息是否包含多个意图。
     */
    public MultiIntentDetectionResult detectMultiIntent(String userMessage) {
        if (!enabled || userMessage == null || userMessage.isBlank()) {
            return MultiIntentDetectionResult.single(userMessage);
        }

        // 快速路径：先用规则模式检测（省Token）
        List<String> ruleBasedSplit = splitByPatterns(userMessage);
        if (ruleBasedSplit.size() >= 2) {
            log.info("[IntentComposition] 规则检测到多意图: count={}", ruleBasedSplit.size());
            return MultiIntentDetectionResult.multi(ruleBasedSplit);
        }

        // 慢路径：用 LLM 检测（更准确）
        try {
            List<String> llmSplit = splitByLLM(userMessage);
            if (llmSplit.size() >= 2) {
                log.info("[IntentComposition] LLM检测到多意图: count={}", llmSplit.size());
                return MultiIntentDetectionResult.multi(llmSplit);
            }
        } catch (Exception e) {
            log.debug("[IntentComposition] LLM检测失败，按单意图处理: {}", e.getMessage());
        }

        return MultiIntentDetectionResult.single(userMessage);
    }

    /**
     * 基于分隔符模式的快速拆分。
     */
    private List<String> splitByPatterns(String userMessage) {
        List<String> parts = new ArrayList<>();
        String remaining = userMessage;

        for (String pattern : SPLIT_PATTERNS) {
            int idx = remaining.indexOf(pattern);
            if (idx > 0) {
                String part = remaining.substring(0, idx).trim();
                if (part.length() >= minIntentLength && !isGreeting(part)) {
                    parts.add(part);
                }
                remaining = remaining.substring(idx + pattern.length()).trim();
            }
        }

        // 处理最后一部分
        if (remaining.length() >= minIntentLength && !isGreeting(remaining)) {
            parts.add(remaining);
        }

        // 过滤掉太短的、寒暄类的
        return parts.stream()
                .filter(p -> p.length() >= minIntentLength)
                .limit(maxParallel)
                .collect(Collectors.toList());
    }

    /**
     * 基于 LLM 的意图拆分（更准确但更慢）。
     */
    private List<String> splitByLLM(String userMessage) {
        String prompt = String.format(INTENT_SPLIT_PROMPT,
                userMessage.length() > 300 ? userMessage.substring(0, 300) : userMessage);

        List<AiMessage> messages = new ArrayList<>();
        messages.add(AiMessage.system("你是一个意图分析专家，擅长从用户消息中提取独立的意图。"));
        messages.add(AiMessage.user(prompt));

        var result = inferenceOrchestrator.chat("intent-split", messages, null);
        if (result == null || result.getContent() == null) {
            return List.of();
        }

        String content = result.getContent().trim();
        List<String> intents = new ArrayList<>();

        // 检查是否为单意图
        if (content.toUpperCase().contains("SINGLE=true")) {
            return List.of();
        }

        // 解析多意图
        for (String line : content.split("\n")) {
            line = line.trim();
            if (line.toUpperCase().startsWith("INTENT_")) {
                int eqIdx = line.indexOf('=');
                if (eqIdx > 0) {
                    String intent = line.substring(eqIdx + 1).trim();
                    if (intent.length() >= minIntentLength) {
                        intents.add(intent);
                    }
                }
            }
        }

        return intents.stream().limit(maxParallel).collect(Collectors.toList());
    }

    private boolean isGreeting(String text) {
        String t = text.toLowerCase().trim();
        return t.matches("^(你好|hi|hello|谢谢|再见|在吗|您好|嗨)+[！!。.]?$");
    }

    /**
     * 合并多个子回答为一个连贯的回答。
     * <p>用 LLM 做润色，确保回答流畅自然。
     */
    public String mergeResponses(String originalQuestion, List<String> subResponses) {
        if (subResponses == null || subResponses.isEmpty()) {
            return "";
        }
        if (subResponses.size() == 1) {
            return subResponses.get(0);
        }

        try {
            StringBuilder prompt = new StringBuilder();
            prompt.append("请将以下多个子问题的回答合并为一个连贯、结构化的完整回答。\n\n");
            prompt.append("用户原问题：").append(originalQuestion).append("\n\n");
            prompt.append("各子回答：\n");
            for (int i = 0; i < subResponses.size(); i++) {
                prompt.append("【子回答").append(i + 1).append("】\n").append(subResponses.get(i)).append("\n\n");
            }
            prompt.append("请整合以上内容，输出一个结构清晰、逻辑连贯的完整回答。" +
                    "可以用小标题、编号等方式组织内容。");

            List<AiMessage> messages = new ArrayList<>();
            messages.add(AiMessage.system("你是一个专业的回答整合专家，擅长将多个回答整合成一个连贯的整体。"));
            messages.add(AiMessage.user(prompt.toString()));

            var result = inferenceOrchestrator.chat("intent-merge", messages, null);
            if (result != null && result.getContent() != null && !result.getContent().isBlank()) {
                log.info("[IntentComposition] 回答合并完成: {}个子回答", subResponses.size());
                return result.getContent().trim();
            }
        } catch (Exception e) {
            log.warn("[IntentComposition] 回答合并失败，直接拼接: {}", e.getMessage());
        }

        // 降级：直接拼接
        StringBuilder sb = new StringBuilder();
        sb.append("为您整理了以下信息：\n\n");
        for (int i = 0; i < subResponses.size(); i++) {
            sb.append("【").append(i + 1).append("】").append(subResponses.get(i)).append("\n\n");
        }
        return sb.toString();
    }

    @Data
    public static class MultiIntentDetectionResult {
        private boolean isMultiIntent;
        private List<String> intents;
        private String originalMessage;

        public static MultiIntentDetectionResult single(String message) {
            MultiIntentDetectionResult r = new MultiIntentDetectionResult();
            r.isMultiIntent = false;
            r.intents = message == null ? Collections.emptyList() : List.of(message);
            r.originalMessage = message;
            return r;
        }

        public static MultiIntentDetectionResult multi(List<String> intents) {
            MultiIntentDetectionResult r = new MultiIntentDetectionResult();
            r.isMultiIntent = true;
            r.intents = intents;
            return r;
        }

        public int getIntentCount() {
            return intents != null ? intents.size() : 0;
        }
    }
}
