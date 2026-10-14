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
public class AuditLogCleanupJob {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired(required = false)
    private TenantService tenantService;

    @Scheduled(cron = "0 50 4 * * ?")
    public void cleanupOldAuditLogs() {
        // ⚠️⚠️ 三个阶段**必须互相独立**（2026-10-14 线上修复，代价是 191 万行数据没人删）：
        //
        //   修复前，第一阶段（审计日志）的 SQL 写的是 `create_time`，
        //   而 t_intelligence_audit_log 的真实列叫 `created_at` ——
        //   于是每天 04:50 都抛 `Unknown column 'create_time'`，
        //   异常被最外层那个 catch 一吞，**后面两段（巡检工单、AI 任务日志）永远不执行**。
        //   实测后果：t_ai_job_run_log 250 万行里有 191 万行早已超过 90 天保留期，
        //   最早记录停在 2026-04-15，每天备份要花 21.5 秒扫 227 万行。
        //
        //   所以：每段各自 try/catch，且失败一律 `log.warn`。
        //   **沉默的清理等于没清理** —— 原来几处 catch 只打 log.debug，
        //   生产日志级别下根本看不见，坏了半年都没人发现。
        cleanAuditLog();
        cleanPatrolActions();
        cleanJobRunLogs();
    }

    /**
     * 阶段一：清理超期审计日志。
     *
     * <p>⚠️ 列名是 {@code created_at}，**不是** {@code create_time}。
     * 2026-10-14 前写成 create_time，导致每日清理必失败（见 {@link #cleanupOldAuditLogs()}）。
     * 已拿生产库 {@code SHOW COLUMNS} 核实。
     */
    private void cleanAuditLog() {
        try {
            int retentionDays = readRetentionDays("system.auditLog.retentionDays", 90);

            if (tenantService != null) {
                List<Tenant> tenants = tenantService.list();
                for (Tenant t : tenants) {
                    int deleted = 0;
                    try {
                        UserContext ctx = new UserContext();
                        ctx.setTenantId(t.getId());
                        ctx.setUserId("SYSTEM");
                        UserContext.set(ctx);
                        deleted = batchDelete(
                                "DELETE FROM t_intelligence_audit_log WHERE tenant_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT " + DELETE_BATCH_SIZE,
                                t.getId(), retentionDays);
                    } catch (Exception e) {
                        // 单个租户失败不能连累其他租户、更不能连累后面两个阶段
                        log.warn("[AuditLogCleanup] 租户{}审计日志清理失败: {}", t.getId(), e.getMessage());
                    } finally {
                        UserContext.clear();
                    }
                    if (deleted > 0) {
                        log.info("[AuditLogCleanup] 租户{}清理{}天前审计日志: 删除{}条", t.getId(), retentionDays, deleted);
                    }
                }
            } else {
                int deleted = batchDelete(
                        "DELETE FROM t_intelligence_audit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT " + DELETE_BATCH_SIZE,
                        retentionDays);
                if (deleted > 0) {
                    log.info("[AuditLogCleanup] 清理{}天前审计日志: 删除{}条", retentionDays, deleted);
                }
            }
        } catch (Exception e) {
            log.warn("[AuditLogCleanup] 审计日志清理失败: {}", e.getMessage());
        }
    }

    /**
     * 阶段二：清理已结束的巡检工单（避免无限累积，分批删除防锁表）。
     *
     * <p>⚠️ 完工时间用 {@code COALESCE(close_time, execution_time, update_time)}：
     * 实测 {@code AUTO_EXECUTED} 的 16378 条**close_time 全为 NULL**
     * （自动执行完只写 execution_time），原来的 {@code close_time < X} 对它们恒不成立
     * → 这部分工单永远删不掉、持续堆积。COALESCE 后才有完工时间可比。
     */
    private void cleanPatrolActions() {
        try {
            int patrolRetentionDays = 30;
            int deleted = batchDelete(
                    "DELETE FROM t_ai_patrol_action WHERE status IN ('CLOSED','EXECUTED','REJECTED','AUTO_EXECUTED') "
                            + "AND COALESCE(close_time, execution_time, update_time) < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT " + DELETE_BATCH_SIZE,
                    patrolRetentionDays);
            if (deleted > 0) {
                log.info("[AuditLogCleanup] 清理{}天前已关闭巡检工单: 删除{}条", patrolRetentionDays, deleted);
            }
        } catch (Exception e) {
            log.warn("[AuditLogCleanup] 巡检工单清理失败(表可能不存在): {}", e.getMessage());
        }
    }
    /**
     * 阶段三：清理 AI 定时任务执行日志（t_ai_job_run_log，D-541）。
     *
     * <p>该表由 {@code JobRunObservabilityAspect} 切所有 @Scheduled 方法自动写入，**只增不减**。
     * 实测（2026-10-14）：250.5 万行，全库最大表，其中 191 万行超期未删
     * —— 因为阶段一的列名 bug 让整个清理方法每次都中断在这一步之前。
     *
     * <p>两级保留（关键）：普通流水 90 天，**失败记录 365 天**。
     *   依据：该表 99.98% 是 SUCCESS 流水，FAILED 只有几百条，
     *   而按 90 天口径统计这些 FAILED **全部落在待删区间内** —— 一刀切会把失败记录清空，
     *   而失败记录正是这张表唯一的排障价值。体量极小，多留一年几乎不占空间。
     *
     * <p>不按租户循环删：该表 {@code tenant_id} 全为 NULL（写入侧只在 tenantId != null 时才 set，
     * 而切面是后台线程、一直传 null），且它记录的是**系统级定时任务**运行情况，不属于任何租户。
     *
     * <p>用 {@code start_time} 而不是 created_at：start_time 上有单列索引 idx_start_time，
     * created_at 没有索引。
     *   ⚠️ 踩过的坑：该表原有的 {@code idx_ajrl_job_time} 是 {@code (job_name, start_time)}
     *   复合索引，以 job_name 打头，按最左前缀原则 {@code WHERE start_time < X} 用不上它 ——
     *   EXPLAIN 退化为 {@code type=index, rows=2180211}（全索引扫描）。
     *   而 V202706260006 曾以"索引重叠"为由把单列 idx_start_time 删了，理由是错的：
     *   复合索引不能替代单列索引服务"只用第二列"的查询。按那种状态跑本清理会越删越慢。
     */
    private void cleanJobRunLogs() {
        try {
            int jobLogRetentionDays = readRetentionDays("system.jobRunLog.retentionDays", 90);
            int jobLogFailedRetentionDays = readRetentionDays("system.jobRunLog.failedRetentionDays", 365);
            // 先删普通流水（占绝大多数，能立刻释放空间）
            int successDeleted = batchDelete(
                    "DELETE FROM t_ai_job_run_log WHERE start_time < DATE_SUB(NOW(), INTERVAL ? DAY) "
                            + "AND status <> 'FAILED' LIMIT " + DELETE_BATCH_SIZE,
                    jobLogRetentionDays);
            if (successDeleted > 0) {
                log.info("[AuditLogCleanup] 清理{}天前AI任务执行日志(成功/跳过流水): 删除{}条",
                        jobLogRetentionDays, successDeleted);
            }
            // 再删超期更久的失败记录（阈值更宽松，保住排障线索）
            int failedDeleted = batchDelete(
                    "DELETE FROM t_ai_job_run_log WHERE start_time < DATE_SUB(NOW(), INTERVAL ? DAY) "
                            + "AND status = 'FAILED' LIMIT " + DELETE_BATCH_SIZE,
                    jobLogFailedRetentionDays);
            if (failedDeleted > 0) {
                log.info("[AuditLogCleanup] 清理{}天前AI任务执行日志(失败记录): 删除{}条",
                        jobLogFailedRetentionDays, failedDeleted);
            }
        } catch (Exception e) {
            log.warn("[AuditLogCleanup] AI任务执行日志清理失败(表可能不存在): {}", e.getMessage());
        }
    }

    /** 分批删除的批大小：每批 500 条，避免大事务长时间锁表 */
    static final int DELETE_BATCH_SIZE = 500;

    /**
     * 分批删除，直到删完，避免大事务长时间锁表。
     *
     * @param sql  含占位符的 DELETE 语句，末尾须带 {@code LIMIT 500}
     * @param args 传给 {@link JdbcTemplate#update(String, Object...)} 的参数
     * @return 本次实际删除的总行数
     */
    private int batchDelete(String sql, Object... args) {
        int total = 0;
        int deleted;
        do {
            deleted = jdbcTemplate.update(sql, args);
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
