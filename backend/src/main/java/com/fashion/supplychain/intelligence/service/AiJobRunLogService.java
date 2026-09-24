package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiJobRunLog;
import com.fashion.supplychain.intelligence.mapper.AiJobRunLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * AI 定时任务执行日志服务
 * <p>
 * 由 {@link com.fashion.supplychain.intelligence.aspect.JobRunObservabilityAspect} 自动调用，
 * 业务代码不需要直接使用此服务。
 * 所有写操作均为 @Async，不阻塞任务主线程。
 * </p>
 * <p>
 * 熔断机制：当 t_ai_job_run_log 表不存在时（如云端 DB 恢复后丢表），
 * 首次失败后进入熔断状态，10 分钟内不再尝试写入，避免日志风暴。
 * 10 分钟后自动重试探测表是否已恢复。
 * </p>
 */
@Slf4j
@Service
@Lazy
public class AiJobRunLogService extends ServiceImpl<AiJobRunLogMapper, AiJobRunLog> {

    /** 熔断状态：表是否可写 */
    private volatile boolean tableWritable = true;

    /** 上一次写入失败的时间戳（毫秒） */
    private volatile long lastFailureMs = 0;

    /** 熔断恢复间隔：10 分钟 */
    private static final long CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000L;

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
        if (tenantId != null) {
            UserContext ctx = new UserContext();
            ctx.setTenantId(tenantId);
            ctx.setUserId("SYSTEM");
            UserContext.set(ctx);
        }
        if (!isWritable()) { UserContext.clear(); return; }
        try {
            AiJobRunLog logEntry = new AiJobRunLog()
                    .setTenantId(tenantId)
                    .setJobName(jobName)
                    .setMethodName(methodName)
                    .setStartTime(startTime)
                    .setDurationMs(durationMs)
                    .setStatus("SUCCESS")
                    .setResultSummary(truncate(resultSummary, 490));
            save(logEntry);
            onWriteSuccess();
        } catch (Exception e) {
            onWriteFailure(e, "写入成功日志失败");
        } finally {
            UserContext.clear();
        }
    }

    @Async
    public void logFailed(String jobName, String methodName, LocalDateTime startTime,
                          long durationMs, String errorMessage, Long tenantId) {
        if (tenantId != null) {
            UserContext ctx = new UserContext();
            ctx.setTenantId(tenantId);
            ctx.setUserId("SYSTEM");
            UserContext.set(ctx);
        }
        if (!isWritable()) { UserContext.clear(); return; }
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
            onWriteSuccess();
        } catch (Exception e) {
            onWriteFailure(e, "写入失败日志失败");
        } finally {
            UserContext.clear();
        }
    }

    /**
     * 查询最近 N 条任务日志（默认 50 条）。
     *
     * <p>⚠️ **不再按 tenant_id 过滤**（2026-09-24 修正）：定时任务是后台线程、无用户上下文，
     * 写入时 tenantId 恒为 null → 表里 tenant_id 全为 NULL，
     * 原先的 {@code WHERE tenant_id = ?} 使本方法**永远返回空**（详见 Mapper 注释与 D-542）。
     * 本表是系统级作业日志，调用方仅限超管，查全量是正确的。
     *
     * @param limit  条数上限，内部夹到 [1, 500]
     * @param status 可选状态筛选（SUCCESS/FAILED/SKIPPED），null 或空表示不筛选
     */
    public List<AiJobRunLog> queryRecent(int limit, String status) {
        if (!tableWritable) {
            return Collections.emptyList();
        }
        try {
            int safeLimit = Math.min(Math.max(limit, 1), 500);
            String safeStatus = (status == null || status.isBlank()) ? null : status.trim();
            return getBaseMapper().selectRecentByStatus(safeLimit, safeStatus);
        } catch (Exception e) {
            onWriteFailure(e, "查询日志失败");
            return Collections.emptyList();
        }
    }

    /** 兼容旧签名：不筛选状态 */
    public List<AiJobRunLog> queryRecent(int limit) {
        return queryRecent(limit, null);
    }

    /**
     * 近 N 天运行概览（总次数 / 失败次数 / 平均与最大耗时 / 涉及任务数）。
     *
     * @param days 统计天数，内部夹到 [1, 365]
     */
    public Map<String, Object> queryStats(int days) {
        if (!tableWritable) {
            return Collections.emptyMap();
        }
        try {
            return getBaseMapper().selectStats(Math.min(Math.max(days, 1), 365));
        } catch (Exception e) {
            onWriteFailure(e, "查询运行统计失败");
            return Collections.emptyMap();
        }
    }

    /** 近 N 天最慢的任务 TOP N（按平均耗时倒序） */
    public List<Map<String, Object>> querySlowestJobs(int days, int limit) {
        if (!tableWritable) {
            return Collections.emptyList();
        }
        try {
            return getBaseMapper().selectSlowestJobs(
                    Math.min(Math.max(days, 1), 365), Math.min(Math.max(limit, 1), 50));
        } catch (Exception e) {
            onWriteFailure(e, "查询最慢任务失败");
            return Collections.emptyList();
        }
    }

    /** 近 N 天失败任务 TOP N */
    public List<Map<String, Object>> queryFailureTop(int days, int limit) {
        if (!tableWritable) {
            return Collections.emptyList();
        }
        try {
            return getBaseMapper().selectFailureTop(
                    Math.min(Math.max(days, 1), 365), Math.min(Math.max(limit, 1), 50));
        } catch (Exception e) {
            onWriteFailure(e, "查询失败任务失败");
            return Collections.emptyList();
        }
    }

    /**
     * 判断当前是否允许写入：
     * - 正常状态（tableWritable=true）→ 允许
     * - 熔断状态且冷却期未过 → 拒绝（静默跳过，不输出日志）
     * - 熔断状态且冷却期已过 → 允许（探测是否恢复）
     */
    private boolean isWritable() {
        if (tableWritable) return true;
        long elapsed = System.currentTimeMillis() - lastFailureMs;
        if (elapsed < CIRCUIT_BREAKER_COOLDOWN_MS) {
            return false;
        }
        // 冷却期已过，允许一次探测
        log.info("[JobRunLog] 熔断冷却期已过({}分钟)，尝试恢复写入", elapsed / 60000);
        return true;
    }

    /** 写入成功：若处于熔断状态则恢复 */
    private void onWriteSuccess() {
        if (!tableWritable) {
            tableWritable = true;
            log.info("[JobRunLog] 表写入恢复正常，熔断解除");
        }
    }

    /** 写入失败：判断是否为表不存在错误，触发熔断 */
    private void onWriteFailure(Exception e, String context) {
        String msg = e.getMessage();
        boolean isTableMissing = msg != null && msg.contains("doesn't exist");
        if (isTableMissing) {
            if (tableWritable) {
                // 首次触发熔断，打印一次 WARN
                log.warn("[JobRunLog] {} — 表不存在，进入熔断状态({}分钟内不再重试): {}",
                        context, CIRCUIT_BREAKER_COOLDOWN_MS / 60000, msg);
            }
            tableWritable = false;
            lastFailureMs = System.currentTimeMillis();
        } else {
            // 非表缺失的其他异常，正常打印 WARN（不触发熔断）
            log.warn("[JobRunLog] {}: {}", context, msg);
        }
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
