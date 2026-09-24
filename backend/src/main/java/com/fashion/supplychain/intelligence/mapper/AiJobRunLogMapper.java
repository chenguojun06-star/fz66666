package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiJobRunLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * AI 定时任务日志 Mapper
 *
 * <p>⚠️ 本表是**系统级**运行日志，查询**刻意不带 tenant_id 过滤**，原因见 {@link #selectRecent}。
 */
@Mapper
public interface AiJobRunLogMapper extends BaseMapper<AiJobRunLog> {

    /**
     * 查询最近 N 条任务日志（按开始时间倒序）。
     *
     * <p><b>为什么没有 tenant_id 过滤（2026-09-24 修正）</b>：
     * 写入方 {@code JobRunObservabilityAspect} 取的是 {@code UserContext.tenantId()}，
     * 而**定时任务是后台线程、没有 HTTP 请求上下文** → 该值恒为 null
     * → 本表 221.9 万行的 tenant_id **全部为 NULL**。
     *
     * <p>于是原先的 {@code WHERE tenant_id = #{tenantId}} 在 SQL 语义下**永远不成立**
     * （`= NULL` 恒为 unknown），接口从 2026-04-14 起就一直返回空 —— 且因前端从未接入，
     * 静默失效了 5 个多月才被发现（见 D-542）。
     *
     * <p>语义上这也本就该查全量：定时任务（AI 巡检、数据一致性、电商同步…）是**系统级**作业，
     * 不属于任何租户；调用方 {@code /api/intelligence/jobs/recent} 亦仅限超管。
     * 因此这里不按租户过滤是正确的，不是"漏了隔离"。
     */
    @Select("SELECT * FROM t_ai_job_run_log ORDER BY start_time DESC LIMIT #{limit}")
    List<AiJobRunLog> selectRecent(@Param("limit") int limit);

    /**
     * 近 N 天的运行统计（供页面顶部概览卡片使用）。
     *
     * <p>别名统一用 camelCase，与 {@link #selectSlowestJobs} / {@link #selectFailureTop} 保持一致
     * （MyBatis 的 map-underscore-to-camel-case 只作用于 Bean 映射，**不影响 Map 结果**，
     * 所以这里必须显式起 camelCase 别名，否则前端要面对两套命名）。
     *
     * <p>注意：无数据时 {@code SUM(...)} 返回 NULL（COUNT 返回 0），前端需按 null 兜底。
     *
     * @param days 统计天数
     * @return 单行：totalRuns / failedRuns / skippedRuns / avgMs / maxMs / jobCount
     */
    @Select("SELECT COUNT(*) AS totalRuns, "
            + "SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failedRuns, "
            + "SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) AS skippedRuns, "
            + "ROUND(AVG(duration_ms)) AS avgMs, "
            + "MAX(duration_ms) AS maxMs, "
            + "COUNT(DISTINCT job_name) AS jobCount "
            + "FROM t_ai_job_run_log WHERE start_time >= DATE_SUB(NOW(), INTERVAL #{days} DAY)")
    Map<String, Object> selectStats(@Param("days") int days);

    /**
     * 近 N 天最慢的若干任务（按平均耗时倒序）。
     *
     * <p>用途：一眼看出"谁在拖时间"。实测（2026-09-24）该查询直接暴露了
     * {@code XiaoyunModelWarmup.warmup} 平均 874ms 但**最大 290 秒**的异常值 ——
     * 这正是本表存在的价值，所以页面必须把它展示出来。
     */
    @Select("SELECT job_name AS jobName, method_name AS methodName, "
            + "COUNT(*) AS runs, ROUND(AVG(duration_ms)) AS avgMs, MAX(duration_ms) AS maxMs "
            + "FROM t_ai_job_run_log WHERE start_time >= DATE_SUB(NOW(), INTERVAL #{days} DAY) "
            + "GROUP BY job_name, method_name ORDER BY avgMs DESC LIMIT #{limit}")
    List<Map<String, Object>> selectSlowestJobs(@Param("days") int days, @Param("limit") int limit);

    /**
     * 近 N 天的失败任务聚合（供"失败 TOP"列表使用）。
     */
    @Select("SELECT job_name AS jobName, method_name AS methodName, "
            + "COUNT(*) AS failCount, MAX(start_time) AS lastFailTime, "
            + "SUBSTRING(MAX(error_message), 1, 300) AS lastError "
            + "FROM t_ai_job_run_log WHERE start_time >= DATE_SUB(NOW(), INTERVAL #{days} DAY) "
            + "AND status = 'FAILED' "
            + "GROUP BY job_name, method_name ORDER BY failCount DESC LIMIT #{limit}")
    List<Map<String, Object>> selectFailureTop(@Param("days") int days, @Param("limit") int limit);

    /**
     * 按状态筛选的最近 N 条日志（status 为 null/空时等同 {@link #selectRecent}）。
     *
     * <p>用 {@code (#{status} IS NULL OR status = #{status})} 而不是动态 SQL，
     * 保持单条注解语句、便于审计脚本静态检查。
     */
    @Select("SELECT * FROM t_ai_job_run_log "
            + "WHERE (#{status} IS NULL OR status = #{status}) "
            + "ORDER BY start_time DESC LIMIT #{limit}")
    List<AiJobRunLog> selectRecentByStatus(@Param("limit") int limit, @Param("status") String status);
}
