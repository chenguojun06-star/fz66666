package com.fashion.supplychain.intelligence.orchestration;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * NL 查询学习追踪器 — 记录查询模式，持续改善意图识别能力
 *
 * <p>核心功能：
 * <ul>
 *   <li>记录每次用户查询的问题、识别意图、置信度</li>
 *   <li>统计各意图命中次数，发现用户高频需求</li>
 *   <li>追踪低置信度查询，识别需要新增的意图模式</li>
 *   <li>对外提供统计数据，供学习报告和 AI 自我改进使用</li>
 * </ul>
 */
@Component
@Slf4j
public class NlQueryLearningTracker {

    private static final int MAX_HISTORY = 500;
    private static final int MAX_LOW_CONFIDENCE = 100;

    /** 查询历史（环形缓冲） */
    private final ConcurrentLinkedDeque<QueryRecord> queryHistory = new ConcurrentLinkedDeque<>();

    /** 意图命中计数 */
    private final ConcurrentHashMap<String, AtomicInteger> intentHits = new ConcurrentHashMap<>();

    /** 低置信度查询（可能需要新意图模式） */
    private final ConcurrentLinkedDeque<String> lowConfidenceQueries = new ConcurrentLinkedDeque<>();

    /** 追踪启动时间 */
    private final LocalDateTime startTime = LocalDateTime.now();

    /**
     * 记录一次查询
     */
    public void recordQuery(String question, String intent, int confidence) {
        queryHistory.addLast(new QueryRecord(question, intent, confidence, LocalDateTime.now()));
        while (queryHistory.size() > MAX_HISTORY) queryHistory.pollFirst();

        intentHits.computeIfAbsent(intent, k -> new AtomicInteger(0)).incrementAndGet();

        if (confidence < 60) {
            lowConfidenceQueries.addLast(question);
            while (lowConfidenceQueries.size() > MAX_LOW_CONFIDENCE) lowConfidenceQueries.pollFirst();
            log.info("[NlQuery学习] 低置信度: q='{}', intent={}, conf={}", question, intent, confidence);
        }
    }

    /**
     * 获取学习统计（供学习报告和自然语言查询使用）
     */
    public Map<String, Object> getQueryStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalQueries", queryHistory.size());
        stats.put("intentCount", intentHits.size());
        stats.put("lowConfidenceCount", lowConfidenceQueries.size());
        stats.put("trackingSince", startTime.toString());

        // 意图分布
        Map<String, Integer> distribution = new TreeMap<>();
        intentHits.forEach((k, v) -> distribution.put(k, v.get()));
        stats.put("intentDistribution", distribution);

        // 最近低置信度查询
        List<String> recentMisses = new ArrayList<>();
        Iterator<String> it = lowConfidenceQueries.descendingIterator();
        int count = 0;
        while (it.hasNext() && count < 5) { recentMisses.add(it.next()); count++; }
        stats.put("recentLowConfidence", recentMisses);

        // 平均置信度
        double avgConf = queryHistory.stream().mapToInt(r -> r.confidence).average().orElse(0);
        stats.put("avgConfidence", Math.round(avgConf * 10) / 10.0);

        return stats;
    }

    /** 获取最高频意图 */
    public String getMostAskedIntent() {
        return intentHits.entrySet().stream()
                .max(Comparator.comparingInt(e -> e.getValue().get()))
                .map(Map.Entry::getKey).orElse("summary");
    }

    private static class QueryRecord {
        final String question;
        final String intent;
        final int confidence;
        final LocalDateTime time;

        QueryRecord(String q, String i, int c, LocalDateTime t) {
            this.question = q; this.intent = i; this.confidence = c; this.time = t;
        }
    }
}
