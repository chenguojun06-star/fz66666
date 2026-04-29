package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.NlQueryLog;
import com.fashion.supplychain.intelligence.mapper.NlQueryLogMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@Slf4j
@RequiredArgsConstructor
public class NlQueryLearningTracker {

    private static final int MAX_HISTORY = 500;
    private static final int MAX_LOW_CONFIDENCE = 100;

    private final NlQueryLogMapper queryLogMapper;

    private final ConcurrentLinkedDeque<QueryRecord> queryHistory = new ConcurrentLinkedDeque<>();
    private final ConcurrentHashMap<String, AtomicInteger> intentHits = new ConcurrentHashMap<>();
    private final ConcurrentLinkedDeque<String> lowConfidenceQueries = new ConcurrentLinkedDeque<>();
    private final LocalDateTime startTime = LocalDateTime.now();

    public void recordQuery(String question, String intent, int confidence) {
        recordQuery(null, question, intent, confidence, null, null);
    }

    public void recordQuery(Long tenantId, String question, String intent, int confidence,
                            String handlerType, Integer responseTimeMs) {
        queryHistory.addLast(new QueryRecord(question, intent, confidence, LocalDateTime.now()));
        while (queryHistory.size() > MAX_HISTORY) queryHistory.pollFirst();

        intentHits.computeIfAbsent(intent, k -> new AtomicInteger(0)).incrementAndGet();

        if (confidence < 60) {
            lowConfidenceQueries.addLast(question);
            while (lowConfidenceQueries.size() > MAX_LOW_CONFIDENCE) lowConfidenceQueries.pollFirst();
            log.info("[NlQuery学习] 低置信度: q='{}', intent={}, conf={}", question, intent, confidence);
        }

        persistAsync(tenantId, question, intent, confidence, handlerType, responseTimeMs);
    }

    @Async
    public void persistAsync(Long tenantId, String question, String intent, int confidence,
                              String handlerType, Integer responseTimeMs) {
        try {
            NlQueryLog logEntry = new NlQueryLog();
            logEntry.setTenantId(tenantId);
            logEntry.setQuestion(question);
            logEntry.setDetectedIntent(intent);
            logEntry.setConfidence(confidence);
            logEntry.setHandlerType(handlerType);
            logEntry.setResponseTimeMs(responseTimeMs);
            logEntry.setCreatedAt(LocalDateTime.now());
            queryLogMapper.insert(logEntry);
        } catch (Exception e) {
            log.warn("[NlQuery学习] 持久化失败: {}", e.getMessage());
        }
    }

    public void recordFeedback(Long tenantId, String question, String userFeedback, String correctIntent) {
        try {
            NlQueryLog latest = queryLogMapper.selectOne(
                    new LambdaQueryWrapper<NlQueryLog>()
                            .eq(tenantId != null, NlQueryLog::getTenantId, tenantId)
                            .eq(NlQueryLog::getQuestion, question)
                            .orderByDesc(NlQueryLog::getCreatedAt)
                            .last("LIMIT 1"));
            if (latest != null) {
                latest.setUserFeedback(userFeedback);
                latest.setCorrectIntent(correctIntent);
                queryLogMapper.updateById(latest);
            }
        } catch (Exception e) {
            log.warn("[NlQuery学习] 反馈记录失败: {}", e.getMessage());
        }
    }

    public Map<String, Object> getQueryStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalQueries", queryHistory.size());
        stats.put("intentCount", intentHits.size());
        stats.put("lowConfidenceCount", lowConfidenceQueries.size());
        stats.put("trackingSince", startTime.toString());

        Map<String, Integer> distribution = new TreeMap<>();
        intentHits.forEach((k, v) -> distribution.put(k, v.get()));
        stats.put("intentDistribution", distribution);

        List<String> recentMisses = new ArrayList<>();
        Iterator<String> it = lowConfidenceQueries.descendingIterator();
        int count = 0;
        while (it.hasNext() && count < 5) { recentMisses.add(it.next()); count++; }
        stats.put("recentLowConfidence", recentMisses);

        double avgConf = queryHistory.stream().mapToInt(r -> r.confidence).average().orElse(0);
        stats.put("avgConfidence", Math.round(avgConf * 10) / 10.0);

        return stats;
    }

    public Map<String, Object> getDbStats(Long tenantId) {
        Map<String, Object> stats = new LinkedHashMap<>();
        try {
            Long totalCount = queryLogMapper.selectCount(
                    new LambdaQueryWrapper<NlQueryLog>()
                            .eq(tenantId != null, NlQueryLog::getTenantId, tenantId));
            stats.put("dbTotalQueries", totalCount);

            Long lowConfCount = queryLogMapper.selectCount(
                    new LambdaQueryWrapper<NlQueryLog>()
                            .eq(tenantId != null, NlQueryLog::getTenantId, tenantId)
                            .lt(NlQueryLog::getConfidence, 60));
            stats.put("dbLowConfidenceCount", lowConfCount);

            Long feedbackCount = queryLogMapper.selectCount(
                    new LambdaQueryWrapper<NlQueryLog>()
                            .eq(tenantId != null, NlQueryLog::getTenantId, tenantId)
                            .isNotNull(NlQueryLog::getUserFeedback));
            stats.put("dbFeedbackCount", feedbackCount);
        } catch (Exception e) {
            log.warn("[NlQuery学习] DB统计查询失败: {}", e.getMessage());
        }
        return stats;
    }

    public String getMostAskedIntent() {
        return intentHits.entrySet().stream()
                .max(Comparator.comparingInt(e -> e.getValue().get()))
                .map(Map.Entry::getKey).orElse("summary");
    }

    private static class QueryRecord {
        final int confidence;

        QueryRecord(String q, String i, int c, LocalDateTime t) {
            this.confidence = c;
        }
    }
}
