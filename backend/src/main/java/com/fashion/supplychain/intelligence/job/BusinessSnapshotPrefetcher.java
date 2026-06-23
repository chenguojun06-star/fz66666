package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.QuickAnswerOrchestrator;
import com.fashion.supplychain.intelligence.service.QuickAnswerCacheService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 业务快照预取器 - 每30分钟自动把关键业务数据变成数字卡片写入秒答缓存。
 *
 * <p>设计原则：
 * <ul>
 *   <li>所有查询都带有 tenant_id WHERE（P0 铁律 4）</li>
 *   <li>所有查询都是 COUNT/GROUP BY 等统计查询，不读大表</li>
 *   <li>单个查询不超过5秒，超过则跳过，不影响整体</li>
 *   <li>失败不抛出异常，只是log.warn，确保定时任务稳定运行</li>
 * </ul>
 */
@Component
@Lazy
@Slf4j
public class BusinessSnapshotPrefetcher {

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    @Autowired(required = false)
    private QuickAnswerCacheService quickAnswerCacheService;

    @Autowired(required = false)
    private QuickAnswerOrchestrator quickAnswerOrchestrator;

    @Value("${xiaoyun.quick-answer.prefetch-enabled:true}")
    private boolean enabled;

    /**
     * 每30分钟执行一次（每小时的0分和30分），与秒答缓存TTL对齐。
     */
    @Scheduled(cron = "${xiaoyun.quick-answer.prefetch-cron:0 0,30 * * * ?}")
    public void prefetchAll() {
        if (!enabled) return;
        if (jdbcTemplate == null || quickAnswerCacheService == null) {
            log.debug("[SnapshotPrefetcher] 未启用或缺少依赖，跳过");
            return;
        }
        try {
            long start = System.currentTimeMillis();
            log.info("[SnapshotPrefetcher] 开始预取业务快照...");

            List<Long> tenantIds = findActiveTenants();
            if (tenantIds.isEmpty()) {
                log.info("[SnapshotPrefetcher] 没有活跃租户，跳过");
                return;
            }
            int successCount = 0;
            for (Long tenantId : tenantIds) {
                try {
                    prefetchForTenant(tenantId);
                    successCount++;
                } catch (Exception e) {
                    log.warn("[SnapshotPrefetcher] tenantId={} 预取失败: {}",
                            tenantId, e.getMessage());
                }
            }
            long elapsed = System.currentTimeMillis() - start;
            log.info("[SnapshotPrefetcher] 完成: {}个租户, 耗时{}ms",
                    successCount, elapsed);

            // 顺便清理过期缓存
            quickAnswerCacheService.cleanExpired();

        } catch (Exception e) {
            log.warn("[SnapshotPrefetcher] 整体执行异常: {}", e.getMessage());
        }
    }

    /** 主动触发（可被接口调用，用于立即刷新） */
    public void prefetchNow(Long tenantId) {
        if (!enabled || jdbcTemplate == null || quickAnswerCacheService == null) return;
        try {
            prefetchForTenant(tenantId);
        } catch (Exception e) {
            log.warn("[SnapshotPrefetcher] 主动预取失败: {}", e.getMessage());
        }
    }

    // ========================================================================
    // 内部方法
    // ========================================================================

    private void prefetchForTenant(Long tenantId) {
        // --- 收集各类业务数字 ---
        Map<String, Object> snapshot = new LinkedHashMap<>();

        try { snapshot.put("生产中订单数", countOrders(tenantId, "IN_PRODUCTION")); }
        catch (Exception e) { log.debug("[SnapshotPrefetcher] 生产中订单数失败: {}", e.getMessage()); snapshot.put("生产中订单数", -1); }

        try { snapshot.put("待开工订单数", countOrders(tenantId, "PENDING")); }
        catch (Exception e) { log.debug("[SnapshotPrefetcher] 待开工订单数失败: {}", e.getMessage()); snapshot.put("待开工订单数", -1); }

        try { snapshot.put("延期订单数", countDelayedOrders(tenantId)); }
        catch (Exception e) { log.debug("[SnapshotPrefetcher] 延期订单数失败: {}", e.getMessage()); snapshot.put("延期订单数", -1); }

        try { snapshot.put("今日已完成订单", countTodayCompleted(tenantId)); }
        catch (Exception e) { log.debug("[SnapshotPrefetcher] 今日完成失败: {}", e.getMessage()); snapshot.put("今日已完成订单", -1); }

        try { snapshot.put("物料短缺预警", countMaterialShortage(tenantId)); }
        catch (Exception e) { log.debug("[SnapshotPrefetcher] 物料短缺失败: {}", e.getMessage()); snapshot.put("物料短缺预警", -1); }

        try { snapshot.put("近24小时质检异常", countQualityIssues24h(tenantId)); }
        catch (Exception e) { log.debug("[SnapshotPrefetcher] 质检异常失败: {}", e.getMessage()); snapshot.put("近24小时质检异常", -1); }

        // --- 构造摘要文本（简洁，适合AI直接吐给用户） ---
        StringBuilder summary = new StringBuilder();
        summary.append("当前业务数据概览：\n");
        summary.append("• 生产中订单: ").append(fmtNum(snapshot.get("生产中订单数"))).append("个\n");
        summary.append("• 待开工订单: ").append(fmtNum(snapshot.get("待开工订单数"))).append("个\n");
        summary.append("• 延期订单: ").append(fmtNum(snapshot.get("延期订单数"))).append("个\n");
        summary.append("• 今日已完成: ").append(fmtNum(snapshot.get("今日已完成订单"))).append("个\n");
        summary.append("• 物料短缺预警: ").append(fmtNum(snapshot.get("物料短缺预警"))).append("项\n");
        summary.append("• 近24小时质检异常: ").append(fmtNum(snapshot.get("近24小时质检异常"))).append("条");

        // --- 构造证据记录（表明数据来源，供DataTruthGuard查） ---
        StringBuilder evidence = new StringBuilder();
        evidence.append("t_production_order(tenant_id=").append(tenantId).append(")");
        evidence.append(", t_material_stock(tenant_id=").append(tenantId).append(")");
        evidence.append(", t_quality_inspection(tenant_id=").append(tenantId).append(")");

        // 使用Orchestrator获得事务保护（P0铁律2：@Transactional仅在Orchestrator层）
        if (quickAnswerOrchestrator != null) {
            quickAnswerOrchestrator.saveSnapshotWithTransaction(tenantId, snapshot,
                    summary.toString(), evidence.toString());
        } else {
            quickAnswerCacheService.saveSnapshot(tenantId, snapshot,
                    summary.toString(), evidence.toString());
        }
    }

    // --- 各查询（安全兜底：无表时返回-1，不影响整体运行） ---

    private int countOrders(Long tenantId, String status) {
        return countWithSql(
                "SELECT COUNT(*) FROM t_production_order " +
                "WHERE tenant_id = ? AND delete_flag = 0 AND order_status = ?",
                tenantId, status);
    }

    private int countDelayedOrders(Long tenantId) {
        // 预计交货日 < 今天 且 状态非COMPLETED/CANCELLED 的订单视为延期
        return countWithSql(
                "SELECT COUNT(*) FROM t_production_order " +
                "WHERE tenant_id = ? AND delete_flag = 0 " +
                "AND order_status NOT IN ('COMPLETED','CANCELLED','DELIVERED','FINISHED') " +
                "AND expected_delivery_date IS NOT NULL " +
                "AND expected_delivery_date < CURDATE()",
                tenantId);
    }

    private int countTodayCompleted(Long tenantId) {
        return countWithSql(
                "SELECT COUNT(*) FROM t_production_order " +
                "WHERE tenant_id = ? AND delete_flag = 0 " +
                "AND DATE(actual_end_time) = CURDATE()",
                tenantId);
    }

    private int countMaterialShortage(Long tenantId) {
        // 可用数量低于安全库存的物料视为短缺
        return countWithSql(
                "SELECT COUNT(*) FROM t_material_stock " +
                "WHERE tenant_id = ? AND delete_flag = 0 " +
                "AND available_quantity < safety_stock",
                tenantId);
    }

    private int countQualityIssues24h(Long tenantId) {
        // 近24小时内有"不合格/次品"记录的质检单
        return countWithSql(
                "SELECT COUNT(*) FROM t_quality_inspection " +
                "WHERE tenant_id = ? AND delete_flag = 0 " +
                "AND inspection_result IN ('FAIL','UNQUALIFIED','DEFECTIVE','REWORK') " +
                "AND inspection_time > NOW() - INTERVAL 24 HOUR",
                tenantId);
    }

    /** 获取活跃租户列表（从生产订单表中去重读取，不依赖其他表） */
    private List<Long> findActiveTenants() {
        try {
            return jdbcTemplate.query(
                    "SELECT DISTINCT tenant_id FROM t_production_order " +
                    "WHERE delete_flag = 0 LIMIT 50",
                    (rs, row) -> rs.getLong("tenant_id"));
        } catch (Exception e) {
            log.warn("[SnapshotPrefetcher] 获取活跃租户失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    /** 安全的COUNT查询：表不存在时返回-1，不抛出异常 */
    private int countWithSql(String sql, Object... args) {
        try {
            Integer n = jdbcTemplate.queryForObject(sql, Integer.class, args);
            return n == null ? 0 : n;
        } catch (Exception e) {
            // 表不存在/列名不对/字段值异常等，返回-1表示"此项数据不可用"
            log.debug("[SnapshotPrefetcher] 查询失败: {} -> {}", sql, e.getMessage());
            return -1;
        }
    }

    private String fmtNum(Object o) {
        if (o == null) return "未知";
        if (o instanceof Number) {
            int n = ((Number) o).intValue();
            if (n < 0) return "暂无数据";
            return String.valueOf(n);
        }
        return String.valueOf(o);
    }
}
