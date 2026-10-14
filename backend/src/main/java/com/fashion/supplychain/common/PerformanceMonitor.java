package com.fashion.supplychain.common;

import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 性能监控工具
 * 用于监控Service层方法的执行时间
 */
@Slf4j
@Aspect
@Component
public class PerformanceMonitor {

    private static final Logger logger = log;

    @Value("${app.performance-monitor.default-warn-threshold-ms:1000}")
    private long defaultWarnThresholdMs;

    @Value("${app.performance-monitor.ai-chat-warn-threshold-ms:5000}")
    private long aiChatWarnThresholdMs;

    @Value("${app.performance-monitor.ai-daily-advice-warn-threshold-ms:5000}")
    private long aiDailyAdviceWarnThresholdMs;

    @Value("${app.performance-monitor.redis-delete-pattern-warn-threshold-ms:2000}")
    private long redisDeletePatternWarnThresholdMs;

    @Value("${app.performance-monitor.production-order-query-warn-threshold-ms:2500}")
    private long productionOrderQueryWarnThresholdMs;

    /**
     * 方法执行统计信息
     */
    public static class MethodStats {
        private final AtomicLong callCount = new AtomicLong(0);
        private final AtomicLong totalTime = new AtomicLong(0);
        private final AtomicLong maxTime = new AtomicLong(0);
        private final AtomicLong minTime = new AtomicLong(Long.MAX_VALUE);

        public void record(long time) {
            callCount.incrementAndGet();
            totalTime.addAndGet(time);
            maxTime.updateAndGet(max -> Math.max(max, time));
            minTime.updateAndGet(min -> Math.min(min, time));
        }

        public long getCallCount() {
            return callCount.get();
        }

        public long getAvgTime() {
            long count = callCount.get();
            return count > 0 ? totalTime.get() / count : 0;
        }

        public long getMaxTime() {
            return maxTime.get();
        }

        public long getMinTime() {
            return minTime.get() == Long.MAX_VALUE ? 0 : minTime.get();
        }

        @Override
        public String toString() {
            return String.format("调用次数: %d, 平均耗时: %dms, 最大耗时: %dms, 最小耗时: %dms",
                    getCallCount(), getAvgTime(), getMaxTime(), getMinTime());
        }
    }

    private final ConcurrentHashMap<String, MethodStats> statsMap = new ConcurrentHashMap<>();

    /**
     * 已经"热"过的方法（每个方法只记一次）。
     *
     * <p><b>为什么要它</b>（2026-10-14）：进程刚起来时，第一次调用某个方法会带上
     * 类加载、JIT 编译、Spring 代理与连接池首次初始化等开销，动辄上千毫秒。
     * 实测生产日志：`AiAdvisorService.cleanupStaleCounters()` 只有一行
     * `removeIf`，却被报「执行耗时 1252ms」—— 那是启动后 20 分钟的首次调用。
     * 同样形态的还有 `CronSchedulerService.tick()`、`AsyncIntelligenceAuditService.flush()`。
     *
     * <p>危害不是"多几条日志"，而是<b>假告警会训练人忽略真告警</b> ——
     * 每次重启都刷几条，看久了就没人再看这一行了，
     * 而这行恰恰是发现真慢方法的唯一入口。所以首次调用不计入告警，
     * 只打 debug；统计（statsMap）仍然照常记录，不影响平均/最大值。
     */
    private final java.util.Set<String> warmedUp = ConcurrentHashMap.newKeySet();

    /**
     * 定义切入点：所有Service层方法
     */
    @Pointcut("execution(* com.fashion.supplychain..service..*.*(..))")
    public void serviceLayer() {}

    /**
     * 环绕通知：记录方法执行时间
     */
    @Around("serviceLayer()")
    public Object monitor(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().toShortString();
        long startTime = System.currentTimeMillis();

        try {
            return joinPoint.proceed();
        } finally {
            long endTime = System.currentTimeMillis();
            long executionTime = endTime - startTime;

            // 记录统计信息
            MethodStats stats = statsMap.computeIfAbsent(methodName, k -> new MethodStats());
            stats.record(executionTime);

            // 首次调用属预热（类加载/JIT/首次初始化），不计入慢方法告警
            boolean firstCall = warmedUp.add(methodName);

            // 如果执行时间超过阈值，记录警告日志
            long warnThreshold = resolveWarnThreshold(methodName);
            if (executionTime > warnThreshold) {
                if (firstCall) {
                    logger.debug("首次调用（含预热开销，不计入慢方法告警）: {} 耗时 {}ms", methodName, executionTime);
                } else {
                    logger.warn("慢方法警告: {} 执行耗时 {}ms (阈值={}ms)", methodName, executionTime, warnThreshold);
                }
            }

            // 记录调试日志
            if (logger.isDebugEnabled()) {
                logger.debug("方法执行: {} 耗时 {}ms", methodName, executionTime);
            }
        }
    }

    private long resolveWarnThreshold(String methodName) {
        if ("AiAdvisorService.chat(..)".equals(methodName)) {
            return aiChatWarnThresholdMs;
        }
        if ("AiAdvisorService.getDailyAdvice(..)".equals(methodName)) {
            return aiDailyAdviceWarnThresholdMs;
        }
        if ("RedisService.deleteByPattern(..)".equals(methodName)) {
            return redisDeletePatternWarnThresholdMs;
        }
        if ("ProductionOrderQueryOrchestrator.queryPage(..)".equals(methodName)) {
            return productionOrderQueryWarnThresholdMs;
        }
        return defaultWarnThresholdMs;
    }

    /**
     * 获取所有统计信息
     */
    public ConcurrentHashMap<String, MethodStats> getAllStats() {
        return new ConcurrentHashMap<>(statsMap);
    }

    /**
     * 获取指定方法的统计信息
     */
    public MethodStats getStats(String methodName) {
        return statsMap.get(methodName);
    }

    /**
     * 清除统计信息
     */
    public void clearStats() {
        statsMap.clear();
    }

    /**
     * 打印统计报告
     */
    public void printReport() {
        logger.info("========== 性能监控报告 ==========");
        if (statsMap.isEmpty()) {
            logger.info("暂无统计信息");
            return;
        }

        statsMap.entrySet().stream()
                .sorted((e1, e2) -> Long.compare(e2.getValue().getAvgTime(), e1.getValue().getAvgTime()))
                .forEach(entry -> {
                    logger.info("{}: {}", entry.getKey(), entry.getValue());
                });
        logger.info("==================================");
    }
}
