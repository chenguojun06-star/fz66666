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
import java.util.Set;

@Slf4j
@Aspect
@Component
public class JobRunObservabilityAspect {

    @Autowired
    private AiJobRunLogService jobRunLogService;

    private static final Set<String> SKIP_LOGGING_METHODS = Set.of(
            "flush",
            "sendHeartbeat",
            "cleanupStaleSessions",
            "cleanupAllLogTables"
    );

    @Around("@annotation(org.springframework.scheduling.annotation.Scheduled)")
    public Object observe(ProceedingJoinPoint pjp) throws Throwable {
        String jobName = pjp.getSignature().getDeclaringType().getSimpleName();
        String methodName = pjp.getSignature().getName();

        if (SKIP_LOGGING_METHODS.contains(methodName)) {
            return pjp.proceed();
        }

        LocalDateTime startTime = LocalDateTime.now();
        long startMs = System.currentTimeMillis();
        Long tenantId = UserContext.tenantId();

        try {
            Object result = pjp.proceed();
            long durationMs = System.currentTimeMillis() - startMs;
            String summary = result != null ? truncate(result.toString(), 490) : "completed";
            try {
                jobRunLogService.logSuccess(jobName, methodName, startTime, durationMs, summary, tenantId);
            } catch (Exception logEx) {
                log.warn("[JobObserver] logSuccess调用异常(不影响任务): {}", logEx.getMessage());
            }
            return result;
        } catch (Throwable t) {
            long durationMs = System.currentTimeMillis() - startMs;
            try {
                jobRunLogService.logFailed(jobName, methodName, startTime, durationMs, t.getMessage(), tenantId);
            } catch (Exception logEx) {
                log.warn("[JobObserver] logFailed调用异常(不影响任务): {}", logEx.getMessage());
            }
            throw t;
        }
    }

    private String truncate(String s, int max) {
        if (s == null || s.length() <= max) return s;
        return s.substring(0, max) + "…";
    }
}
