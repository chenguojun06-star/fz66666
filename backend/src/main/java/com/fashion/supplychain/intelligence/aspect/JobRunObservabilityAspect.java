package com.fashion.supplychain.intelligence.aspect;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.AiJobRunLogService;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 定时任务可观测性 AOP 切面
 * <p>
 * 自动拦截所有 {@code @Scheduled} 方法，记录执行耗时和成功/失败状态到 {@code t_ai_job_run_log} 表。
 * 无需修改任何现有定时任务代码：只要 @Scheduled 注解存在，均自动被覆盖。
 * </p>
 * <p>
 * 日志写入为异步操作（{@link AiJobRunLogService} 方法带 @Async），不阻塞任务主线程。
 * 若日志写入本身抛出异常，会在 service 层内部 catch 并打印 warn，不会影响任务正常运行。
 * </p>
 *
 * <pre>
 * 设计参考：EvoNexus 项目 JobObserver 模式 —— 结构化存储任务执行日志，便于运营排障
 * </pre>
 */
@Slf4j
@Aspect
@Component
public class JobRunObservabilityAspect {

    @Autowired
    private AiJobRunLogService jobRunLogService;

    /**
     * 拦截所有带 @Scheduled 注解的方法
     * <p>
     * pointcut 匹配 Spring 所有 @Scheduled 注解，不限制包路径，
     * 因此会覆盖项目中全部定时任务（intelligence、production、system 等模块均适用）。
     * </p>
     */
    @Around("@annotation(org.springframework.scheduling.annotation.Scheduled)")
    public Object observe(ProceedingJoinPoint pjp) throws Throwable {
        String jobName = pjp.getSignature().getDeclaringType().getSimpleName();
        String methodName = pjp.getSignature().getName();
        LocalDateTime startTime = LocalDateTime.now();
        long startMs = System.currentTimeMillis();
        Long tenantId = UserContext.tenantId();

        try {
            Object result = pjp.proceed();
            long durationMs = System.currentTimeMillis() - startMs;
            String summary = result != null ? truncate(result.toString(), 490) : "completed";
            jobRunLogService.logSuccess(jobName, methodName, startTime, durationMs, summary, tenantId);
            return result;
        } catch (Throwable t) {
            long durationMs = System.currentTimeMillis() - startMs;
            jobRunLogService.logFailed(jobName, methodName, startTime, durationMs, t.getMessage(), tenantId);
            throw t;
        }
    }

    private String truncate(String s, int max) {
        if (s == null || s.length() <= max) return s;
        return s.substring(0, max) + "…";
    }
}
