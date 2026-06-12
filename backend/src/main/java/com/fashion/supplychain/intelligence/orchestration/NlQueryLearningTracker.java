package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.NlQueryLog;
import com.fashion.supplychain.intelligence.mapper.NlQueryLogMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import jakarta.annotation.PostConstruct;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@Lazy
@Slf4j
@RequiredArgsConstructor
public class NlQueryLearningTracker {

    private static final int MAX_HISTORY = 500;
    private static final int MAX_LOW_CONFIDENCE = 100;

    private final NlQueryLogMapper queryLogMapper;
    private final JdbcTemplate jdbcTemplate;

    private final ConcurrentLinkedDeque<QueryRecord> queryHistory = new ConcurrentLinkedDeque<>();
    private final ConcurrentHashMap<String, AtomicInteger> intentHits = new ConcurrentHashMap<>();
    private final ConcurrentLinkedDeque<String> lowConfidenceQueries = new ConcurrentLinkedDeque<>();
    private final LocalDateTime startTime = LocalDateTime.now();

    @PostConstruct
    public void loadFromDb() {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT user_query, detected_intent, confidence, created_at " +
                    "FROM t_nl_query_learning ORDER BY created_at DESC LIMIT ?", MAX_HISTORY);
            Collections.reverse(rows);
            for (Map<String, Object> row : rows) {
                String query = (String) row.get("user_query");
                String intent = (String) row.get("detected_intent");
                Double conf = row.get("confidence") != null ? ((Number) row.get("confidence")).doubleValue() : 0;
                LocalDateTime createdAt = row.get("created_at") != null
                        ? (row.get("created_at") instanceof java.sql.Timestamp
                            ? ((java.sql.Timestamp) row.get("created_at")).toLocalDateTime()
                            : LocalDateTime.parse(row.get("created_at").toString()))
                        : LocalDateTime.now();

                queryHistory.addLast(new QueryRecord(query, intent, (int) Math.round(conf), createdAt));
                if (intent != null) {
                    intentHits.computeIfAbsent(intent, k -> new AtomicInteger(0)).incrementAndGet();
                }
                if (conf < 60 && query != null) {
                    lowConfidenceQueries.addLast(query);
                    while (lowConfidenceQueries.size() > MAX_LOW_CONFIDENCE) lowConfidenceQueries.pollFirst();
                }
            }
            log.info("[NlQuery学习] 从DB加载 {} 条历史记录, {} 个意图分布", queryHistory.size(), intentHits.size());
        } catch (Exception e) {
            log.warn("[NlQuery学习] 启动加载历史记录失败: {}", e.getMessage());
        }
    }

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
        persistLearningAsync(tenantId, question, intent, confidence);
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

    @Async
    public void persistLearningAsync(Long tenantId, String question, String intent, int confidence) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO t_nl_query_learning (tenant_id, user_query, detected_intent, confidence, created_at) " +
                    "VALUES (?, ?, ?, ?, NOW())",
                    tenantId != null ? tenantId : 0, question, intent, (double) confidence);
        } catch (Exception e) {
            log.warn("[NlQuery学习] 学习记录持久化失败: {}", e.getMessage());
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

            updateLearningFeedback(tenantId, question, correctIntent);
        } catch (Exception e) {
            log.warn("[NlQuery学习] 反馈记录失败: {}", e.getMessage());
        }
    }

    private void updateLearningFeedback(Long tenantId, String question, String correctIntent) {
        try {
            jdbcTemplate.update(
                    "UPDATE t_nl_query_learning SET was_correct = (detected_intent = ?), corrected_intent = ? " +
                    "WHERE tenant_id = ? AND user_query = ? ORDER BY created_at DESC LIMIT 1",
                    correctIntent, correctIntent,
                    tenantId != null ? tenantId : 0, question);
        } catch (Exception e) {
            log.warn("[NlQuery学习] 学习反馈更新失败: {}", e.getMessage());
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

            Long learningCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM t_nl_query_learning" +
                    (tenantId != null ? " WHERE tenant_id = ?" : ""),
                    tenantId != null ? new Object[]{tenantId} : new Object[]{},
                    Long.class);
            stats.put("dbLearningCount", learningCount);
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
        final String question;
        final String intent;
        final int confidence;
        final LocalDateTime createdAt;

        QueryRecord(String q, String i, int c, LocalDateTime t) {
            this.question = q;
            this.intent = i;
            this.confidence = c;
            this.createdAt = t;
        }
    }
}
