package com.fashion.supplychain.intelligence.service;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicLong;

/**
 * AI响应速度监控服务
 * 
 * <p>功能：
 * <ol>
 *   <li>实时监控AI响应延迟</li>
 *   <li>统计平均响应时间、最大/最小响应时间</li>
 *   <li>识别慢响应请求</li>
 *   <li>提供性能指标报告</li>
 * </ol>
 */
@Service
@Slf4j
public class AiResponseTimeMonitor {

    /** 最大保留的历史记录数 */
    private static final int MAX_HISTORY_SIZE = 1000;
    
    /** 慢响应阈值（毫秒）- 超过此值视为慢响应 */
    private static final long SLOW_RESPONSE_THRESHOLD = 3000;
    
    /** 警告响应阈值（毫秒）- 超过此值记录警告 */
    private static final long WARNING_THRESHOLD = 1500;

    /** 响应时间历史记录 */
    private final Deque<ResponseRecord> responseHistory = new ConcurrentLinkedDeque<>();
    
    /** 按租户统计 */
    private final ConcurrentHashMap<Long, TenantStats> tenantStats = new ConcurrentHashMap<>();
    
    /** 按模型统计 */
    private final ConcurrentHashMap<String, ModelStats> modelStats = new ConcurrentHashMap<>();
    
    /** 总请求数 */
    private final AtomicLong totalRequests = new AtomicLong(0);
    
    /** 慢请求数 */
    private final AtomicLong slowRequests = new AtomicLong(0);
    
    /** 总响应时间 */
    private final AtomicLong totalResponseTime = new AtomicLong(0);

    /**
     * 记录响应时间
     */
    public void record(Long tenantId, String modelName, long durationMs, boolean success) {
        // 创建记录
        ResponseRecord record = new ResponseRecord();
        record.setTenantId(tenantId);
        record.setModelName(modelName);
        record.setDurationMs(durationMs);
        record.setSuccess(success);
        record.setTimestamp(LocalDateTime.now());

        // 添加到历史记录
        responseHistory.addFirst(record);
        while (responseHistory.size() > MAX_HISTORY_SIZE) {
            responseHistory.removeLast();
        }

        // 更新统计
        totalRequests.incrementAndGet();
        totalResponseTime.addAndGet(durationMs);
        
        if (durationMs >= SLOW_RESPONSE_THRESHOLD) {
            slowRequests.incrementAndGet();
            log.warn("[AiResponseMonitor] 慢响应警告: tenantId={}, model={}, duration={}ms", 
                    tenantId, modelName, durationMs);
        } else if (durationMs >= WARNING_THRESHOLD) {
            log.info("[AiResponseMonitor] 响应时间警告: tenantId={}, model={}, duration={}ms", 
                    tenantId, modelName, durationMs);
        }

        // 更新租户统计
        tenantStats.compute(tenantId, (id, stats) -> {
            if (stats == null) {
                stats = new TenantStats(id);
            }
            stats.record(durationMs, success);
            return stats;
        });

        // 更新模型统计
        modelStats.compute(modelName, (name, stats) -> {
            if (stats == null) {
                stats = new ModelStats(name);
            }
            stats.record(durationMs, success);
            return stats;
        });
    }

    /**
     * 获取整体性能报告
     */
    public PerformanceReport getOverallReport() {
        PerformanceReport report = new PerformanceReport();
        report.setTotalRequests(totalRequests.get());
        report.setSlowRequests(slowRequests.get());
        report.setSlowRequestRate(totalRequests.get() > 0 ? 
                (double) slowRequests.get() / totalRequests.get() * 100 : 0);
        
        if (totalRequests.get() > 0) {
            report.setAverageResponseTime((double) totalResponseTime.get() / totalRequests.get());
        }

        // 计算最近100条的统计
        List<ResponseRecord> recent = new ArrayList<>(responseHistory);
        if (!recent.isEmpty()) {
            report.setRecentMinResponseTime(recent.stream().mapToLong(ResponseRecord::getDurationMs).min().orElse(0));
            report.setRecentMaxResponseTime(recent.stream().mapToLong(ResponseRecord::getDurationMs).max().orElse(0));
            report.setRecentAvgResponseTime(recent.stream().mapToLong(ResponseRecord::getDurationMs).average().orElse(0));
        }

        // 按租户排序
        List<TenantStats> tenantList = new ArrayList<>(tenantStats.values());
        tenantList.sort((a, b) -> Long.compare(b.getRequestCount().get(), a.getRequestCount().get()));
        report.setTopTenants(tenantList.subList(0, Math.min(5, tenantList.size())));

        // 按模型排序
        List<ModelStats> modelList = new ArrayList<>(modelStats.values());
        modelList.sort((a, b) -> Long.compare(b.getRequestCount().get(), a.getRequestCount().get()));
        report.setTopModels(modelList.subList(0, Math.min(5, modelList.size())));

        return report;
    }

    /**
     * 获取租户性能报告
     */
    public TenantStats getTenantReport(Long tenantId) {
        return tenantStats.getOrDefault(tenantId, new TenantStats(tenantId));
    }

    /**
     * 获取最近的慢请求记录
     */
    public List<ResponseRecord> getRecentSlowRequests(int limit) {
        return responseHistory.stream()
                .filter(r -> r.getDurationMs() >= SLOW_RESPONSE_THRESHOLD)
                .limit(limit)
                .toList();
    }

    /**
     * 重置统计数据
     */
    public void reset() {
        responseHistory.clear();
        tenantStats.clear();
        modelStats.clear();
        totalRequests.set(0);
        slowRequests.set(0);
        totalResponseTime.set(0);
        log.info("[AiResponseMonitor] 统计数据已重置");
    }

    /**
     * 响应记录
     */
    @Data
    public static class ResponseRecord {
        private Long tenantId;
        private String modelName;
        private long durationMs;
        private boolean success;
        private LocalDateTime timestamp;
    }

    /**
     * 租户统计
     */
    @Data
    public static class TenantStats {
        private final Long tenantId;
        private final AtomicLong requestCount = new AtomicLong(0);
        private final AtomicLong successCount = new AtomicLong(0);
        private final AtomicLong totalDuration = new AtomicLong(0);
        private volatile long minDuration = Long.MAX_VALUE;
        private volatile long maxDuration = 0;

        public TenantStats(Long tenantId) {
            this.tenantId = tenantId;
        }

        public void record(long duration, boolean success) {
            requestCount.incrementAndGet();
            if (success) successCount.incrementAndGet();
            totalDuration.addAndGet(duration);
            if (duration < minDuration) minDuration = duration;
            if (duration > maxDuration) maxDuration = duration;
        }

        public double getAverageDuration() {
            return requestCount.get() > 0 ? 
                    (double) totalDuration.get() / requestCount.get() : 0;
        }

        public double getSuccessRate() {
            return requestCount.get() > 0 ? 
                    (double) successCount.get() / requestCount.get() * 100 : 0;
        }
    }

    /**
     * 模型统计
     */
    @Data
    public static class ModelStats {
        private final String modelName;
        private final AtomicLong requestCount = new AtomicLong(0);
        private final AtomicLong successCount = new AtomicLong(0);
        private final AtomicLong totalDuration = new AtomicLong(0);
        private volatile long minDuration = Long.MAX_VALUE;
        private volatile long maxDuration = 0;

        public ModelStats(String modelName) {
            this.modelName = modelName;
        }

        public void record(long duration, boolean success) {
            requestCount.incrementAndGet();
            if (success) successCount.incrementAndGet();
            totalDuration.addAndGet(duration);
            if (duration < minDuration) minDuration = duration;
            if (duration > maxDuration) maxDuration = duration;
        }

        public double getAverageDuration() {
            return requestCount.get() > 0 ? 
                    (double) totalDuration.get() / requestCount.get() : 0;
        }

        public double getSuccessRate() {
            return requestCount.get() > 0 ? 
                    (double) successCount.get() / requestCount.get() * 100 : 0;
        }
    }

    /**
     * 性能报告
     */
    @Data
    public static class PerformanceReport {
        private long totalRequests;
        private long slowRequests;
        private double slowRequestRate;
        private double averageResponseTime;
        private long recentMinResponseTime;
        private long recentMaxResponseTime;
        private double recentAvgResponseTime;
        private List<TenantStats> topTenants;
        private List<ModelStats> topModels;
    }
}
