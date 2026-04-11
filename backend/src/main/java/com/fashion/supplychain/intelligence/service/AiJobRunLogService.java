package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.intelligence.entity.AiJobRunLog;
import com.fashion.supplychain.intelligence.mapper.AiJobRunLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * AI 定时任务执行日志服务
 * <p>
 * 由 {@link com.fashion.supplychain.intelligence.aspect.JobRunObservabilityAspect} 自动调用，
 * 业务代码不需要直接使用此服务。
 * 所有写操作均为 @Async，不阻塞任务主线程。
 * </p>
 */
@Slf4j
@Service
public class AiJobRunLogService extends ServiceImpl<AiJobRunLogMapper, AiJobRunLog> {

    /**
     * 异步记录任务成功日志
     *
     * @param jobName       类名（简短名）
     * @param methodName    方法名
     * @param startTime     开始时间
     * @param durationMs    耗时毫秒
     * @param resultSummary 执行摘要
     */
    @Async
    public void logSuccess(String jobName, String methodName, LocalDateTime startTime,
                           long durationMs, String resultSummary, Long tenantId) {
        try {
            AiJobRunLog log = new AiJobRunLog()
                    .setTenantId(tenantId)
                    .setJobName(jobName)
                    .setMethodName(methodName)
                    .setStartTime(startTime)
                    .setDurationMs(durationMs)
                    .setStatus("SUCCESS")
                    .setResultSummary(truncate(resultSummary, 490));
            save(log);
        } catch (Exception e) {
            log.warn("[JobRunLog] 写入成功日志失败: {}", e.getMessage());
        }
    }

    @Async
    public void logFailed(String jobName, String methodName, LocalDateTime startTime,
                          long durationMs, String errorMessage, Long tenantId) {
        try {
            AiJobRunLog record = new AiJobRunLog()
                    .setTenantId(tenantId)
                    .setJobName(jobName)
                    .setMethodName(methodName)
                    .setStartTime(startTime)
                    .setDurationMs(durationMs)
                    .setStatus("FAILED")
                    .setErrorMessage(truncate(errorMessage, 2000));
            save(record);
        } catch (Exception e) {
            log.warn("[JobRunLog] 写入失败日志失败: {}", e.getMessage());
        }
    }

    /**
     * 查询最近 N 条任务日志（默认 50 条）
     */
    public List<AiJobRunLog> queryRecent(int limit) {
        int safeLimit = Math.min(Math.max(limit, 1), 200);
        return getBaseMapper().selectRecent(safeLimit);
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
