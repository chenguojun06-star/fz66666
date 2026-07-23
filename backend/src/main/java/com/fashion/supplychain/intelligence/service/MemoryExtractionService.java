package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class MemoryExtractionService {

    @Autowired(required = false)
    private AiLongMemoryMapper aiLongMemoryMapper;

    @Value("${xiaoyun.memory.extraction.top-k:5}")
    private int topK;

    @Value("${xiaoyun.memory.extraction.score-threshold:0.4}")
    private double scoreThreshold;

    @Value("${xiaoyun.memory.extraction.recency-decay:0.05}")
    private double recencyDecay;

    @Value("${xiaoyun.memory.extraction.max-age-days:90}")
    private int maxAgeDays;

    private static final String[] INTENT_KEYWORDS = {
            "订单", "进度", "延期", "逾期", "扫码", "产量", "工资", "结算",
            "库存", "入库", "采购", "供应商", "质检", "返工", "次品",
            "交期", "排产", "产能", "成本", "报价", "样衣", "开发",
            "客户", "收款", "发货", "退货", "库存差异", "改价", "退款"
    };

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ExtractedMemory {
        private Long id;
        private String subjectName;
        private String subjectType;
        private String content;
        private String layer;
        private Double confidence;
        private Double extractionScore;
        private Long hitCount;
        private LocalDateTime updateTime;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MemoryExtractionResult {
        private List<ExtractedMemory> memories;
        private int totalScored;
        private String intentCategory;
        private Map<String, Double> intentScores;
    }

    public MemoryExtractionResult extractRelevantMemories(String query) {
        return extractRelevantMemories(query, UserContext.tenantId(), topK);
    }

    public MemoryExtractionResult extractRelevantMemories(String query, Long tenantId) {
        return extractRelevantMemories(query, tenantId, topK);
    }

    public MemoryExtractionResult extractRelevantMemories(String query, Long tenantId, int limit) {
        if (aiLongMemoryMapper == null || tenantId == null || query == null || query.isBlank()) {
            return new MemoryExtractionResult(Collections.emptyList(), 0, null, Collections.emptyMap());
        }

        Map<String, Double> intentScores = calculateIntentScores(query);
        String intentCategory = determineIntentCategory(intentScores);

        List<AiLongMemory> candidates = fetchCandidateMemories(tenantId, intentCategory);
        if (candidates.isEmpty()) {
            return new MemoryExtractionResult(Collections.emptyList(), 0, intentCategory, intentScores);
        }

        List<ExtractedMemory> scored = candidates.stream()
                .map(mem -> scoreMemory(mem, query, intentScores))
                .filter(mem -> mem.getExtractionScore() >= scoreThreshold)
                .sorted((a, b) -> Double.compare(b.getExtractionScore(), a.getExtractionScore()))
                .limit(limit)
                .collect(Collectors.toList());

        log.debug("[MemoryExtraction] 提取完成: query={}, intent={}, total={}, selected={}",
                query, intentCategory, candidates.size(), scored.size());

        return new MemoryExtractionResult(scored, candidates.size(), intentCategory, intentScores);
    }

    private Map<String, Double> calculateIntentScores(String query) {
        Map<String, Double> scores = new LinkedHashMap<>();
        String lowerQuery = query.toLowerCase();

        for (String keyword : INTENT_KEYWORDS) {
            int count = countOccurrences(lowerQuery, keyword.toLowerCase());
            if (count > 0) {
                scores.put(keyword, (double) count * 0.3);
            }
        }

        if (lowerQuery.contains("分析") || lowerQuery.contains("为什么") || lowerQuery.contains("原因")) {
            addIntentScore(scores, "分析", 0.2);
        }
        if (lowerQuery.contains("预测") || lowerQuery.contains("趋势") || lowerQuery.contains("未来")) {
            addIntentScore(scores, "预测", 0.2);
        }
        if (lowerQuery.contains("比较") || lowerQuery.contains("对比") || lowerQuery.contains("差异")) {
            addIntentScore(scores, "比较", 0.15);
        }
        if (lowerQuery.contains("最优") || lowerQuery.contains("方案") || lowerQuery.contains("建议")) {
            addIntentScore(scores, "建议", 0.15);
        }

        double maxScore = scores.values().stream().mapToDouble(Double::doubleValue).max().orElse(1.0);
        scores.replaceAll((k, v) -> v / maxScore);

        return scores;
    }

    private void addIntentScore(Map<String, Double> scores, String key, double value) {
        scores.merge(key, value, Double::sum);
    }

    private int countOccurrences(String text, String keyword) {
        int count = 0;
        int idx = 0;
        while ((idx = text.indexOf(keyword, idx)) != -1) {
            count++;
            idx += keyword.length();
        }
        return count;
    }

    private String determineIntentCategory(Map<String, Double> intentScores) {
        return intentScores.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("通用查询");
    }

    private List<AiLongMemory> fetchCandidateMemories(Long tenantId, String intentCategory) {
        try {
            LocalDateTime cutoffTime = LocalDateTime.now().minus(maxAgeDays, ChronoUnit.DAYS);

            com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AiLongMemory> wrapper =
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AiLongMemory>()
                            .eq(AiLongMemory::getTenantId, tenantId)
                            .eq(AiLongMemory::getDeleteFlag, 0)
                            .gt(AiLongMemory::getUpdateTime, cutoffTime)
                            .orderByDesc(AiLongMemory::getHitCount)
                            .last("LIMIT 100");

            return aiLongMemoryMapper.selectList(wrapper);
        } catch (Exception e) {
            log.warn("[MemoryExtraction] 获取候选记忆失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private ExtractedMemory scoreMemory(AiLongMemory mem, String query, Map<String, Double> intentScores) {
        double relevanceScore = calculateRelevanceScore(mem, query, intentScores);
        double recencyScore = calculateRecencyScore(mem.getUpdateTime());
        double confidenceScore = mem.getConfidence() != null ? mem.getConfidence().doubleValue() / 100.0 : 0.5;
        double hitScore = mem.getHitCount() != null ? Math.min(mem.getHitCount() / 10.0, 0.3) : 0.0;

        double extractionScore = (relevanceScore * 0.4) + (recencyScore * 0.3) +
                (confidenceScore * 0.2) + (hitScore * 0.1);

        return new ExtractedMemory(
                mem.getId(),
                mem.getSubjectName(),
                mem.getSubjectType(),
                mem.getContent(),
                mem.getLayer(),
                mem.getConfidence() != null ? mem.getConfidence().doubleValue() : null,
                extractionScore,
                mem.getHitCount() != null ? mem.getHitCount().longValue() : null,
                mem.getUpdateTime()
        );
    }

    private double calculateRelevanceScore(AiLongMemory mem, String query, Map<String, Double> intentScores) {
        String content = (mem.getContent() != null ? mem.getContent() : "") +
                (mem.getSubjectName() != null ? " " + mem.getSubjectName() : "");
        String lowerContent = content.toLowerCase();
        String lowerQuery = query.toLowerCase();

        double score = 0.0;
        int matchedKeywords = 0;

        for (Map.Entry<String, Double> entry : intentScores.entrySet()) {
            String keyword = entry.getKey().toLowerCase();
            if (lowerContent.contains(keyword)) {
                score += entry.getValue();
                matchedKeywords++;
            }
        }

        if (matchedKeywords > 0) {
            score /= matchedKeywords;
        }

        if (mem.getSubjectType() != null && lowerQuery.contains(mem.getSubjectType().toLowerCase())) {
            score += 0.1;
        }

        return Math.min(score, 1.0);
    }

    private double calculateRecencyScore(LocalDateTime updateTime) {
        if (updateTime == null) {
            return 0.3;
        }

        long hoursSinceUpdate = ChronoUnit.HOURS.between(updateTime, LocalDateTime.now());
        double decayFactor = Math.exp(-recencyDecay * hoursSinceUpdate / 24.0);

        return Math.max(0.1, decayFactor);
    }

    public String buildMemoryPromptBlock(List<ExtractedMemory> memories) {
        if (memories == null || memories.isEmpty()) {
            return "";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("## 相关记忆\n");
        sb.append("以下是与当前对话相关的历史信息，供你参考：\n\n");

        for (int i = 0; i < memories.size(); i++) {
            ExtractedMemory mem = memories.get(i);
            sb.append(i + 1).append(". **").append(safeString(mem.getSubjectName())).append("**");
            if (mem.getSubjectType() != null) {
                sb.append(" (").append(mem.getSubjectType()).append(")");
            }
            sb.append("\n");
            sb.append("   ").append(truncateContent(mem.getContent(), 200)).append("\n");
            sb.append("   置信度: ").append(String.format("%.1f", mem.getExtractionScore() * 100)).append("%\n\n");
        }

        return sb.toString();
    }

    private String safeString(String s) {
        return s != null ? s : "未知";
    }

    private String truncateContent(String content, int maxLength) {
        if (content == null) {
            return "";
        }
        if (content.length() <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength) + "...";
    }
}