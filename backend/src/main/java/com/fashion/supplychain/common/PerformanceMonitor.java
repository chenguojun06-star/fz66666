package com.fashion.supplychain.common;

import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
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

            // 如果执行时间超过阈值，记录警告日志
            if (executionTime > 1000) {
                log.warn("慢方法警告: {} 执行耗时 {}ms", methodName, executionTime);
            }

            // 记录调试日志
            if (log.isDebugEnabled()) {
                log.debug("方法执行: {} 耗时 {}ms", methodName, executionTime);
            }
        }
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
        log.info("========== 性能监控报告 ==========");
        if (statsMap.isEmpty()) {
            log.info("暂无统计信息");
            return;
        }

        statsMap.entrySet().stream()
                .sorted((e1, e2) -> Long.compare(e2.getValue().getAvgTime(), e1.getValue().getAvgTime()))
                .forEach(entry -> {
                    log.info("{}: {}", entry.getKey(), entry.getValue());
                });
        log.info("==================================");
    }
}
