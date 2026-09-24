package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.TenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class AuditLogCleanupJob {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired(required = false)
    private TenantService tenantService;

    @Scheduled(cron = "0 50 4 * * ?")
    public void cleanupOldAuditLogs() {
        try {
            int retentionDays = readRetentionDays("system.auditLog.retentionDays", 90);

            if (tenantService != null) {
                List<Tenant> tenants = tenantService.list();
                for (Tenant t : tenants) {
                    UserContext ctx = new UserContext();
                    ctx.setTenantId(t.getId());
                    ctx.setUserId("SYSTEM");
                    UserContext.set(ctx);
                    try {
                        int totalDeleted = 0;
                        int batchDeleted;
                        do {
                            batchDeleted = jdbcTemplate.update(
                                    "DELETE FROM t_intelligence_audit_log WHERE tenant_id = ? AND create_time < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 500",
                                    t.getId(), retentionDays);
                            totalDeleted += batchDeleted;
                        } while (batchDeleted >= 500);
                        if (totalDeleted > 0) {
                            log.info("[AuditLogCleanup] 租户{}清理{}天前审计日志: 删除{}条", t.getId(), retentionDays, totalDeleted);
                        }
                    } finally {
                        UserContext.clear();
                    }
                }
            } else {
                int totalDeleted = 0;
                int batchDeleted;
                do {
                    batchDeleted = jdbcTemplate.update(
                            "DELETE FROM t_intelligence_audit_log WHERE create_time < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 500",
                            retentionDays);
                    totalDeleted += batchDeleted;
                } while (batchDeleted >= 500);
                if (totalDeleted > 0) {
                    log.info("[AuditLogCleanup] 清理{}天前审计日志: 删除{}条", retentionDays, totalDeleted);
                }
            }
            // 清理已关闭超过30天的巡检工单（避免无限累积，分批删除防锁表）
            try {
                int patrolRetentionDays = 30;
                int totalPatrolDeleted = 0;
                int batchDeleted;
                do {
                    batchDeleted = jdbcTemplate.update(
                            "DELETE FROM t_ai_patrol_action WHERE status IN ('CLOSED','EXECUTED','REJECTED','AUTO_EXECUTED') " +
                            "AND close_time < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 500",
                            patrolRetentionDays);
                    totalPatrolDeleted += batchDeleted;
                } while (batchDeleted >= 500);
                if (totalPatrolDeleted > 0) {
                    log.info("[AuditLogCleanup] 清理{}天前已关闭巡检工单: 删除{}条", patrolRetentionDays, totalPatrolDeleted);
                }
            } catch (Exception e) {
                log.debug("[AuditLogCleanup] 巡检工单清理跳过(表可能不存在): {}", e.getMessage());
            }

            // 清理 AI 定时任务执行日志（t_ai_job_run_log，D-541）
            //
            // 为什么需要：该表由 JobRunObservabilityAspect 切所有 @Scheduled 方法自动写入，
            // **只增不减**。实测 2026-09-24：221.9 万行 / 329MB（数据 221MB + 索引 108MB），
            // 全库最大表，当前仍以 ~4,450 行/天增长。
            //
            // 两级保留（关键）：普通流水 90 天，**失败记录 365 天**。
            //   依据：该表 99.98% 是 SUCCESS 流水，FAILED 只有 340 条，
            //   而按 90 天口径统计这 340 条**全部落在待删区间内** —— 一刀切会把失败记录清空，
            //   而失败记录正是这张表唯一的排障价值。340 条体量极小，多留一年几乎不占空间。
            //
            // 为什么按时间删、而不是像审计日志那样按租户循环：
            //   实测该表 tenant_id **全为 NULL**（写入侧只在 tenantId != null 时才 set，
            //   而切面一直传 null），且它记录的是**系统级定时任务**运行情况、不是租户业务数据。
            //   按租户循环删会一条都删不掉。
            //
            // 为什么用 start_time 而不是 created_at 做条件：
            //   start_time 上有单列索引 idx_start_time（**注意：它是本单
            //   V202709240004 才补回来的** —— 见下），created_at **没有索引**。
            //
            //   ⚠️ 加这个索引前踩过的坑：该表原有的 `idx_ajrl_job_time` 是
            //   `(job_name, start_time)` **复合**索引，以 job_name 打头，按最左前缀原则
            //   `WHERE start_time < X` 用不上它 —— 实测 EXPLAIN 退化为 `type=index, rows=2180211`
            //   （全索引扫描）。而 V202706260006 曾以"索引重叠"为由把单列 idx_start_time 删了，
            //   理由是错的：复合索引不能替代单列索引服务"只用第二列"的查询。
            //   按那种状态跑本清理会「越删越慢」（每批 500 条都要全扫一遍）。
            try {
                int jobLogRetentionDays = readRetentionDays("system.jobRunLog.retentionDays", 90);
                int jobLogFailedRetentionDays = readRetentionDays("system.jobRunLog.failedRetentionDays", 365);
                // 先删普通流水（占绝大多数，能立刻释放空间）
                int totalJobLogDeleted = batchDelete(
                        "DELETE FROM t_ai_job_run_log WHERE start_time < DATE_SUB(NOW(), INTERVAL ? DAY) "
                                + "AND status <> 'FAILED' LIMIT " + DELETE_BATCH_SIZE,
                        jobLogRetentionDays);
                if (totalJobLogDeleted > 0) {
                    log.info("[AuditLogCleanup] 清理{}天前AI任务执行日志(成功/跳过流水): 删除{}条",
                            jobLogRetentionDays, totalJobLogDeleted);
                }
                // 再删超期更久的失败记录（阈值更宽松，保住排障线索）
                int totalFailedDeleted = batchDelete(
                        "DELETE FROM t_ai_job_run_log WHERE start_time < DATE_SUB(NOW(), INTERVAL ? DAY) "
                                + "AND status = 'FAILED' LIMIT " + DELETE_BATCH_SIZE,
                        jobLogFailedRetentionDays);
                if (totalFailedDeleted > 0) {
                    log.info("[AuditLogCleanup] 清理{}天前AI任务执行日志(失败记录): 删除{}条",
                            jobLogFailedRetentionDays, totalFailedDeleted);
                }
            } catch (Exception e) {
                log.debug("[AuditLogCleanup] AI任务执行日志清理跳过(表可能不存在): {}", e.getMessage());
            }
        } catch (Exception e) {
            log.warn("[AuditLogCleanup] 审计日志清理失败: {}", e.getMessage());
        }
    }

    /** 分批删除的批大小：每批 500 条，避免大事务长时间锁表 */
    static final int DELETE_BATCH_SIZE = 500;

    /**
     * 分批删除「早于 days 天」的行，直到删完，避免大事务长时间锁表。
     *
     * @param sql  含单个 {@code ?}（保留天数）的 DELETE 语句，末尾须带 {@code LIMIT DELETE_BATCH_SIZE}
     * @param days 保留天数
     * @return 本次实际删除的总行数
     */
    private int batchDelete(String sql, int days) {
        int total = 0;
        int deleted;
        do {
            deleted = jdbcTemplate.update(sql, days);
            total += deleted;
        } while (deleted >= DELETE_BATCH_SIZE);
        return total;
    }

    /**
     * 读取保留天数参数；参数缺失、非法或读取失败时回落 {@code defaultDays}。
     *
     * <p>⚠️ 列名务必是 {@code param_key} / {@code param_value} ——
     * 本方法的前身写成了 {@code config_key} / {@code config_value} / {@code delete_flag}，
     * 这三个列在 {@code t_param_config} 里都不存在，异常又被 catch 成 debug 日志吞掉，
     * 于是"保留期可配"**静默失效、永远用默认值**（2026-09-24 发现并修正）。
     * 参数行本身由 {@code V202709240003__add_log_retention_params.sql} 保证存在。
     */
    private int readRetentionDays(String paramKey, int defaultDays) {
        try {
            String val = jdbcTemplate.queryForObject(
                    "SELECT param_value FROM t_param_config WHERE param_key = ? LIMIT 1",
                    String.class, paramKey);
            if (val != null && !val.isBlank()) {
                int parsed = Integer.parseInt(val.trim());
                if (parsed > 0) return parsed;
            }
        } catch (Exception e) {
            log.debug("[AuditLogCleanup] 读取参数 {} 失败，回落默认 {} 天: {}", paramKey, defaultDays, e.getMessage());
        }
        return defaultDays;
    }
}
