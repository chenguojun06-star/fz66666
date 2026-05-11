package com.fashion.supplychain.intelligence.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
public class ClosedOrderAiDataCleanupService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final Set<String> TERMINAL_STATUSES = new HashSet<>(Arrays.asList("closed", "scrapped", "completed"));

    private static final List<String> CLEANUP_QUERIES_BY_ORDER_ID = Arrays.asList(
            "DELETE FROM t_intelligence_signal WHERE source_id = ? AND delete_flag = 0",
            "DELETE FROM t_intelligence_audit_log WHERE target_id = ?",
            "DELETE FROM t_order_risk_tracking WHERE order_no = (SELECT order_no FROM t_production_order WHERE id = ?)"
    );

    private static final List<String> CLEANUP_QUERIES_BY_ORDER_NO = Arrays.asList(
            "DELETE FROM t_intelligence_signal WHERE source_id = ? AND delete_flag = 0",
            "DELETE FROM t_intelligence_audit_log WHERE target_id = ?",
            "DELETE FROM t_order_risk_tracking WHERE order_no = ?",
            "DELETE FROM t_sys_notice WHERE order_no = ?",
            "DELETE FROM t_mind_push_log WHERE order_no = ?"
    );

    @Async("aiSelfCriticExecutor")
    public void cleanupAsync(String orderId, String orderNo) {
        try {
            cleanup(orderId, orderNo);
        } catch (Exception e) {
            log.warn("[ClosedOrderCleanup] 异步清理失败 orderId={} orderNo={}: {}", orderId, orderNo, e.getMessage());
        }
    }

    public int cleanup(String orderId, String orderNo) {
        int total = 0;

        if (orderId != null) {
            for (String sql : CLEANUP_QUERIES_BY_ORDER_ID) {
                try {
                    int deleted = jdbcTemplate.update(sql, orderId);
                    if (deleted > 0) {
                        total += deleted;
                        log.debug("[ClosedOrderCleanup] orderId={} SQL={} 删除{}条", orderId, sql.substring(0, 60), deleted);
                    }
                } catch (Exception e) {
                    log.warn("[ClosedOrderCleanup] orderId={} 清理失败: {}", orderId, e.getMessage());
                }
            }
        }

        if (orderNo != null) {
            for (String sql : CLEANUP_QUERIES_BY_ORDER_NO) {
                try {
                    int deleted = jdbcTemplate.update(sql, orderNo);
                    if (deleted > 0) {
                        total += deleted;
                        log.debug("[ClosedOrderCleanup] orderNo={} SQL={} 删除{}条", orderNo, sql.substring(0, 60), deleted);
                    }
                } catch (Exception e) {
                    log.warn("[ClosedOrderCleanup] orderNo={} 清理失败: {}", orderNo, e.getMessage());
                }
            }
        }

        if (total > 0) {
            log.info("[ClosedOrderCleanup] 订单{}({})终态清理完成，共删除{}条AI关联数据", orderNo, orderId, total);
        }
        return total;
    }

    public int cleanupAllTerminalOrders() {
        List<String> terminalOrders = jdbcTemplate.queryForList(
                "SELECT id FROM t_production_order WHERE status IN ('closed','scrapped','completed') AND delete_flag = 0",
                String.class);
        List<String> terminalOrderNos = jdbcTemplate.queryForList(
                "SELECT order_no FROM t_production_order WHERE status IN ('closed','scrapped','completed') AND delete_flag = 0",
                String.class);

        int total = 0;
        for (int i = 0; i < terminalOrders.size(); i++) {
            String orderId = terminalOrders.get(i);
            String orderNo = i < terminalOrderNos.size() ? terminalOrderNos.get(i) : null;
            total += cleanup(orderId, orderNo);
        }

        log.info("[ClosedOrderCleanup] 全量终态订单清理完成，共{}个订单，删除{}条AI关联数据", terminalOrders.size(), total);
        return total;
    }
}
