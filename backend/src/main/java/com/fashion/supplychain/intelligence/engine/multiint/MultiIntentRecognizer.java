package com.fashion.supplychain.intelligence.engine.multiint;

import com.fashion.supplychain.intelligence.engine.dto.MultiIntentResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class MultiIntentRecognizer {

    private final QueryModifierExtractor modifierExtractor;
    private final IntentCompositionEngine compositionEngine;

    @Autowired(required = false)
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final List<IntentDef> KNOWN_INTENTS = List.of(
        new IntentDef("overdue", List.of("延期", "逾期", "拖期", "超时", "推迟")),
        new IntentDef("factory_ranking", List.of("工厂排名", "哪个工厂", "工厂对比", "工厂表现", "top")),
        new IntentDef("wage_query", List.of("工资", "工钱", "薪资", "结算")),
        new IntentDef("material_shortage", List.of("缺料", "物料不足", "缺货", "库存不足")),
        new IntentDef("quality_issue", List.of("质量", "次品", "返工", "质检")),
        new IntentDef("production_progress", List.of("进度", "完成", "当前", "做到哪", "到哪里")),
        new IntentDef("delivery_risk", List.of("交期", "发货", "出货", "客户催")),
        new IntentDef("report_generate", List.of("报表", "报告", "汇总", "统计")),
        new IntentDef("order_query", List.of("订单", "工单", "po")),
        new IntentDef("worker_query", List.of("工人", "员工", "裁剪工", "缝纫工"))
    );

    private static final Set<String> LOW_CONFIDENCE_QUERIES = Set.of(
        "你好", "hi", "hello", "在吗", "?", "？", "什么", "怎么", "为什么"
    );

    private final Map<String, MultiIntentResult> llmCache = new ConcurrentHashMap<>();
    private static final int LLM_CACHE_TTL_SECONDS = 600;

    public MultiIntentResult recognize(String query, Long tenantId) {
        if (query == null || query.isBlank()) {
            return empty(tenantId);
        }

        Map<String, Object> modifiers = modifierExtractor.extract(query);

        List<MultiIntentResult.IntentCandidate> cands = keywordClassify(query);
        double maxConfidence = cands.stream()
                .mapToDouble(MultiIntentResult.IntentCandidate::getConfidence)
                .max()
                .orElse(0.0);

        if (shouldFallbackToLlm(query, cands, maxConfidence)) {
            MultiIntentResult llmResult = recognizeWithLlm(query, tenantId);
            if (llmResult != null && !llmResult.getCandidates().isEmpty()) {
                llmResult.setModifiers(modifiers);
                return compositionEngine.compose(llmResult.getCandidates(), modifiers, tenantId);
            }
        }

        return compositionEngine.compose(cands, modifiers, tenantId);
    }

    private boolean shouldFallbackToLlm(String query, List<MultiIntentResult.IntentCandidate> cands, double maxConf) {
        if (query.length() > 50) return true;
        if (maxConf >= 0.6) return false;
        String trimmed = query.trim();
        for (String low : LOW_CONFIDENCE_QUERIES) {
            if (trimmed.equalsIgnoreCase(low) || trimmed.contains(low)) return true;
        }
        if (cands.isEmpty()) return true;
        if (cands.size() == 1 && cands.get(0).getConfidence() < 0.5) return true;
        return false;
    }

    private MultiIntentResult recognizeWithLlm(String query, Long tenantId) {
        if (inferenceOrchestrator == null) return null;
        String cacheKey = query.toLowerCase().trim();
        MultiIntentResult cached = llmCache.get(cacheKey);
        if (cached != null) return cached;
        try {
            String systemPrompt = buildLlmSystemPrompt();
            com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult result =
                    inferenceOrchestrator.chat("nl-intent", systemPrompt, query);
            if (result == null || !result.isSuccess() || result.getContent() == null) return null;
            MultiIntentResult parsed = parseLlmResult(result.getContent(), tenantId);
            if (parsed != null) {
                llmCache.put(cacheKey, parsed);
                if (llmCache.size() > 500) {
                    llmCache.clear();
                }
            }
            return parsed;
        } catch (Exception e) {
            log.debug("[MultiIntentRecognizer] LLM fallback failed: {}", e.getMessage());
            return null;
        }
    }

    private String buildLlmSystemPrompt() {
        StringBuilder sb = new StringBuilder();
        sb.append("你是意图识别助手。给定用户查询，请识别其中包含的意图。\n");
        sb.append("可选意图列表（可多选）：\n");
        for (IntentDef def : KNOWN_INTENTS) {
            sb.append("- ").append(def.name).append(": ").append(String.join("、", def.keywords)).append("\n");
        }
        sb.append("\n请只返回JSON数组格式，例如：\n");
        sb.append("[{\"name\":\"overdue\",\"confidence\":0.85},{\"name\":\"order_query\",\"confidence\":0.6}]\n");
        sb.append("如果没有匹配的意图，返回空数组 []。不要返回其他文字。");
        return sb.toString();
    }

    private MultiIntentResult parseLlmResult(String content, Long tenantId) {
        if (content == null || content.isBlank()) return null;
        try {
            String json = content.trim();
            int firstBracket = json.indexOf('[');
            int lastBracket = json.lastIndexOf(']');
            if (firstBracket < 0 || lastBracket <= firstBracket) return null;
            json = json.substring(firstBracket, lastBracket + 1);
            List<Map<String, Object>> rawList = objectMapper.readValue(json, new ArrayList<Map<String, Object>>() {}.getClass());
            List<MultiIntentResult.IntentCandidate> cands = new ArrayList<>();
            for (Map<String, Object> raw : rawList) {
                String name = String.valueOf(raw.get("name"));
                double confidence = 0.5;
                Object confObj = raw.get("confidence");
                if (confObj instanceof Number n) confidence = Math.max(0, Math.min(1, n.doubleValue()));
                cands.add(new MultiIntentResult.IntentCandidate(name, confidence));
            }
            MultiIntentResult r = new MultiIntentResult();
            r.setCandidates(cands);
            r.setModifiers(new HashMap<>());
            r.setTenantId(tenantId);
            return r;
        } catch (Exception e) {
            log.debug("[MultiIntentRecognizer] parse LLM result failed: {}", e.getMessage());
            return null;
        }
    }

    private List<MultiIntentResult.IntentCandidate> keywordClassify(String query) {
        List<MultiIntentResult.IntentCandidate> result = new ArrayList<>();
        String lowerQuery = query.toLowerCase();

        for (IntentDef def : KNOWN_INTENTS) {
            int matchCount = 0;
            for (String keyword : def.keywords) {
                if (lowerQuery.contains(keyword.toLowerCase())) {
                    matchCount++;
                }
            }
            if (matchCount > 0) {
                double confidence = Math.min(0.5 + matchCount * 0.15, 0.95);
                result.add(new MultiIntentResult.IntentCandidate(def.name, confidence));
            }
        }

        result.sort((a, b) -> Double.compare(b.getConfidence(), a.getConfidence()));
        if (result.size() > 3) {
            return result.subList(0, 3);
        }
        return result;
    }

    private MultiIntentResult empty(Long tenantId) {
        MultiIntentResult r = new MultiIntentResult();
        r.setCandidates(new ArrayList<>());
        r.setModifiers(Map.of());
        r.setTenantId(tenantId);
        return r;
    }

    public int clearLlmCache() {
        int size = llmCache.size();
        llmCache.clear();
        return size;
    }

    private static class IntentDef {
        final String name;
        final List<String> keywords;

        IntentDef(String name, List<String> keywords) {
            this.name = name;
            this.keywords = keywords;
        }
    }
}
