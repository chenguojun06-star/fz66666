package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.system.dto.SystemIssueItemDTO;
import com.fashion.supplychain.system.dto.SystemIssueSummaryDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 系统问题收集编排器
 * 每次调用实时查询数据库，向超级管理员暴露系统中的异常/隐患
 * 仅通过 SystemIssueController 在超管看板中调用，频率低，不缓存
 */
@Service
public class SystemIssueCollectorOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(SystemIssueCollectorOrchestrator.class);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * 收集系统当前存在的所有问题
     */
    public SystemIssueSummaryDTO collect() {
        List<SystemIssueItemDTO> issues = new ArrayList<>();

        safeCheck(issues, this::checkScanFailures24h);
        safeCheck(issues, this::checkSuccessScanMissingBundle);
        safeCheck(issues, this::checkStagnantOrders);
        safeCheck(issues, this::checkMissingProcessCode);
        safeCheck(issues, this::checkDuplicateScanBlocked);
        safeCheck(issues, this::checkDatabaseConnection);

        long errorCount = issues.stream().filter(i -> "ERROR".equals(i.getLevel())).count();
        long warnCount  = issues.stream().filter(i -> "WARN".equals(i.getLevel())).count();
        long infoCount  = issues.size() - errorCount - warnCount;

        log.info("[SystemIssueCollector] 检查完成: ERROR={}, WARN={}, INFO={}", errorCount, warnCount, infoCount);
        return new SystemIssueSummaryDTO((int) errorCount, (int) warnCount, (int) infoCount, issues, LocalDateTime.now());
    }

    // ─────────────────────────────────────────────────────────────────
    // 检查项 1：近24小时扫码失败次数
    // ─────────────────────────────────────────────────────────────────
    private void checkScanFailures24h(List<SystemIssueItemDTO> issues) {
        String sql = "SELECT COUNT(*) as cnt, MAX(scan_time) as last_seen " +
                     "FROM t_scan_record " +
                     "WHERE scan_result = 'fail' AND scan_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)";
        Map<String, Object> row = jdbcTemplate.queryForMap(sql);
        int cnt = toInt(row.get("cnt"));
        if (cnt > 0) {
            String level = cnt >= 10 ? "ERROR" : "WARN";
            issues.add(SystemIssueItemDTO.of(level, "SCAN",
                    "近24小时扫码失败 " + cnt + " 次",
                    "工厂扫码时出现 scan_result=fail，可能因二维码格式错误、工序识别失败、SKU不匹配等原因导致。",
                    cnt, toTime(row.get("last_seen")),
                    "前往 系统日志 或 扫码记录 筛选 scan_result=fail 查看详情"));
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // 检查项 2：近7天成功扫码但 cutting_bundle_id 为空（兜底命中）
    // ─────────────────────────────────────────────────────────────────
    private void checkSuccessScanMissingBundle(List<SystemIssueItemDTO> issues) {
        String sql = "SELECT COUNT(*) as cnt, MAX(scan_time) as last_seen " +
                     "FROM t_scan_record " +
                     "WHERE scan_result = 'success' " +
                     "  AND (cutting_bundle_id IS NULL OR cutting_bundle_id = '') " +
                     "  AND scan_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
        Map<String, Object> row = jdbcTemplate.queryForMap(sql);
        int cnt = toInt(row.get("cnt"));
        if (cnt > 0) {
            issues.add(SystemIssueItemDTO.of("WARN", "SCAN",
                    "近7天 " + cnt + " 条扫码记录缺少菲号关联",
                    "扫码成功但 cutting_bundle_id 为空，说明 getByQrCode 未命中，依赖 bundleNo兜底 或 color/size兜底查找菲号。可能影响工序归属统计准确性。",
                    cnt, toTime(row.get("last_seen")),
                    "检查扫描的二维码格式是否标准（应为 PO...-ST...-颜色-尺码-数量-序号 格式）"));
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // 检查项 3：停滞订单（非完成且3天内无成功扫码）
    // ─────────────────────────────────────────────────────────────────
    private void checkStagnantOrders(List<SystemIssueItemDTO> issues) {
        String sql = "SELECT COUNT(*) as cnt FROM t_production_order po " +
                     "LEFT JOIN (" +
                     "  SELECT order_id, MAX(scan_time) as last_scan " +
                     "  FROM t_scan_record WHERE scan_result='success' GROUP BY order_id" +
                     ") sr ON sr.order_id = po.id " +
                     "WHERE po.status NOT IN ('completed','cancelled','COMPLETED','CANCELLED') " +
                     "  AND po.delete_flag = 0 " +
                     "  AND (sr.last_scan IS NULL OR sr.last_scan < DATE_SUB(NOW(), INTERVAL 3 DAY))";
        Map<String, Object> row = jdbcTemplate.queryForMap(sql);
        int cnt = toInt(row.get("cnt"));
        if (cnt > 0) {
            String level = cnt >= 20 ? "ERROR" : "WARN";
            issues.add(SystemIssueItemDTO.of(level, "ORDER",
                    cnt + " 个订单停滞（3天内无扫码）",
                    "进行中的订单连续3天没有新的成功扫码记录，可能是工厂停工、扫码设备故障或订单遗忘跟进。",
                    cnt, null,
                    "前往 生产进度 页面，查看停滞订单（橙色 ⏸ 停滞标签）"));
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // 检查项 4：近7天成功扫码但 process_code 为空（工序识别失败）
    // ─────────────────────────────────────────────────────────────────
    private void checkMissingProcessCode(List<SystemIssueItemDTO> issues) {
        String sql = "SELECT COUNT(*) as cnt, MAX(scan_time) as last_seen " +
                     "FROM t_scan_record " +
                     "WHERE scan_result = 'success' " +
                     "  AND (process_code IS NULL OR process_code = '') " +
                     "  AND scan_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
        Map<String, Object> row = jdbcTemplate.queryForMap(sql);
        int cnt = toInt(row.get("cnt"));
        if (cnt > 0) {
            issues.add(SystemIssueItemDTO.of("WARN", "SCAN",
                    "近7天 " + cnt + " 条扫码缺少工序编码",
                    "扫码成功但 process_code 字段为空，说明工序识别阶段（StageDetector）未能识别出具体工序，可能导致工资结算不准确。",
                    cnt, toTime(row.get("last_seen")),
                    "检查订单的工序配置是否完整，工序名称与扫码时参数是否匹配"));
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // 检查项 5：近7天重复扫码被拦截次数
    // ─────────────────────────────────────────────────────────────────
    private void checkDuplicateScanBlocked(List<SystemIssueItemDTO> issues) {
        String sql = "SELECT COUNT(*) as cnt, MAX(scan_time) as last_seen " +
                     "FROM t_scan_record " +
                     "WHERE scan_result = 'duplicate' " +
                     "  AND scan_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
        Map<String, Object> row = jdbcTemplate.queryForMap(sql);
        int cnt = toInt(row.get("cnt"));
        if (cnt > 20) {
            issues.add(SystemIssueItemDTO.of("INFO", "SCAN",
                    "近7天 " + cnt + " 次重复扫码被拦截",
                    "防重复算法触发次数较多，属于正常保护机制。若工人反映明明没扫过却被拦截，需检查最小间隔算法参数。",
                    cnt, toTime(row.get("last_seen")),
                    "属于正常范围可忽略；若业务反馈误拦截严重，可查 StageDetector.js 中的 minInterval 参数"));
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // 检查项 6：数据库连通性
    // ─────────────────────────────────────────────────────────────────
    private void checkDatabaseConnection(List<SystemIssueItemDTO> issues) {
        try {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        } catch (Exception e) {
            issues.add(SystemIssueItemDTO.of("ERROR", "DATABASE",
                    "数据库连接异常",
                    "无法执行基础查询：" + e.getMessage(),
                    1, LocalDateTime.now(),
                    "立即检查数据库容器状态，运行 docker ps | grep mysql"));
        }
    }

    // ─────── 工具方法 ───────
    private void safeCheck(List<SystemIssueItemDTO> issues, java.util.function.Consumer<List<SystemIssueItemDTO>> checker) {
        try {
            checker.accept(issues);
        } catch (Exception e) {
            log.warn("[SystemIssueCollector] 某项检查执行失败（已跳过）: {}", e.getMessage());
        }
    }

    private int toInt(Object obj) {
        if (obj == null) return 0;
        return ((Number) obj).intValue();
    }

    private LocalDateTime toTime(Object obj) {
        if (obj == null) return null;
        if (obj instanceof LocalDateTime) return (LocalDateTime) obj;
        if (obj instanceof java.sql.Timestamp) return ((java.sql.Timestamp) obj).toLocalDateTime();
        return null;
    }
}
