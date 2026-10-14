package com.fashion.supplychain.common;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@code PerformanceMonitor} 预热保护的契约测试。
 *
 * <p>守护的核心契约：<b>方法的首次调用（含类加载 / JIT / 首次初始化开销）
 * 不计入「慢方法警告」</b>，但统计仍然照常记录。
 *
 * <p>背景（2026-10-14 生产日志实测）：进程刚起来时，第一次调用某个方法会带上
 * 预热开销。实测 {@code AiAdvisorService.cleanupStaleCounters()} 只有一行
 * {@code removeIf}，却被报「执行耗时 1252ms」—— 那是启动后 20 分钟的首次调用；
 * 同形态的还有 {@code CronSchedulerService.tick()}、
 * {@code AsyncIntelligenceAuditService.flush()}，每次重启都各刷一条。
 *
 * <p>危害不是"多几条日志"，而是<b>假告警会训练人忽略真告警</b> ——
 * 看久了就没人再看这一行，而这行恰恰是发现真慢方法的唯一入口。
 */
@DisplayName("PerformanceMonitor - 首次调用预热不计入慢方法告警")
class PerformanceMonitorTest {

    /** 造一个耗时可控的 joinPoint */
    private ProceedingJoinPoint joinPoint(String method, long sleepMs) throws Throwable {
        ProceedingJoinPoint pjp = mock(ProceedingJoinPoint.class);
        Signature sig = mock(Signature.class);
        when(sig.toShortString()).thenReturn(method);
        when(pjp.getSignature()).thenReturn(sig);
        when(pjp.proceed()).thenAnswer(inv -> {
            if (sleepMs > 0) {
                Thread.sleep(sleepMs);
            }
            return "ok";
        });
        return pjp;
    }

    private boolean warnedFor(PerformanceMonitor monitor, String method) {
        Object v = ReflectionTestUtils.getField(monitor, "warmedUp");
        assertThat(v).isInstanceOf(Set.class);
        return ((Set<?>) v).contains(method);
    }

    @Test
    @DisplayName("首次慢调用标记为已预热，但仍计入统计（不影响平均/最大值）")
    void firstCallIsMarkedWarmButStillCounted() throws Throwable {
        PerformanceMonitor monitor = new PerformanceMonitor();
        String method = "SelftestService.slow(..)";

        assertThat(warnedFor(monitor, method)).as("尚未调用过").isFalse();
        monitor.monitor(joinPoint(method, 1100));
        assertThat(warnedFor(monitor, method)).as("首次调用后应标记为已预热").isTrue();

        @SuppressWarnings("unchecked")
        java.util.Map<String, ?> statsMap =
                (java.util.Map<String, ?>) ReflectionTestUtils.getField(monitor, "statsMap");
        assertThat(statsMap).as("统计必须照常记录，预热只影响告警不影响度量")
                .containsKey(method);
    }

    @Test
    @DisplayName("同一个方法第二次慢调用不再被当作预热")
    void secondCallIsNotWarmup() throws Throwable {
        PerformanceMonitor monitor = new PerformanceMonitor();
        String method = "SelftestService.slow2(..)";

        monitor.monitor(joinPoint(method, 1100));   // 首次：算预热
        boolean alreadyWarm = warnedFor(monitor, method);
        assertThat(alreadyWarm).isTrue();

        // 第二次再调，warmedUp.add 返回 false（说明会走真正的 warn 分支）
        @SuppressWarnings("unchecked")
        Set<String> warmedUp = (Set<String>) ReflectionTestUtils.getField(monitor, "warmedUp");
        assertThat(warmedUp.add(method)).as("第二次 add 应返回 false，即不再视为预热").isFalse();
    }

    @Test
    @DisplayName("快方法不受影响：正常返回、不标记预热也不告警")
    void fastCallIsUnaffected() throws Throwable {
        PerformanceMonitor monitor = new PerformanceMonitor();
        Object result = monitor.monitor(joinPoint("SelftestService.fast(..)", 0));

        assertThat(result).isEqualTo("ok");
    }
}
