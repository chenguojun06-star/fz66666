package com.fashion.supplychain.intelligence.engine.risk;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 外发无响应风险检测器（SUGGESTION模式）
 *
 * 检测逻辑：查询外发工厂订单（factory_type='EXTERNAL'），
 * 最后扫码时间距今>48小时的订单标记为风险。
 */
@Slf4j
@Component
@Lazy
@RequiredArgsConstructor
public class OutsourceRiskDetector implements RiskDetector {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public RiskType getType() { return RiskType.OUTSOURCE; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        java.time.LocalDateTime threeMonthsAgo = java.time.LocalDateTime.now().minusMonths(3);

        // 查询外发工厂订单及其最后扫码时间，筛选无扫码或>48小时无扫码的
        String sql = "SELECT po.id, po.order_no, po.factory_id, po.status, " +
                "latest.last_scan_time AS lastScanTime " +
                "FROM t_production_order po " +
                "LEFT JOIN ( " +
                "  SELECT order_id, MAX(scan_time) AS last_scan_time " +
                "  FROM t_scan_record " +
                "  WHERE tenant_id = ? AND scan_result = 'success' AND scan_type != 'orchestration' " +
                "  GROUP BY order_id " +
                ") latest ON po.id = latest.order_id " +
                "WHERE po.tenant_id = ? " +
                "  AND po.delete_flag = 0 " +
                "  AND po.factory_type = 'EXTERNAL' " +
                "  AND po.status NOT IN ('completed', 'cancelled', 'scrapped', 'archived', 'closed') " +
                "  AND po.update_time >= ? " +
                "  AND (latest.last_scan_time IS NULL " +
                "       OR latest.last_scan_time < DATE_SUB(NOW(), INTERVAL 48 HOUR)) " +
                "LIMIT 500";

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId, tenantId, threeMonthsAgo);

        List<RiskItem> items = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        for (Map<String, Object> row : rows) {
            String orderId = (String) row.get("id");
            String orderNo = (String) row.get("order_no");
            String factoryId = (String) row.get("factory_id");
            Object lastScanTimeObj = row.get("lastScanTime");

            long silentHours;
            String description;
            if (lastScanTimeObj == null) {
                silentHours = -1; // 无扫码记录
                description = "外发订单 " + orderNo + " 从未有扫码记录";
            } else {
                LocalDateTime lastScanTime = (LocalDateTime) lastScanTimeObj;
                silentHours = ChronoUnit.HOURS.between(lastScanTime, now);
                description = "外发订单 " + orderNo + " 已 " + silentHours + " 小时无扫码响应";
            }

            String severity = silentHours < 0 || silentHours >= 96 ? "CRITICAL"
                    : silentHours >= 72 ? "HIGH" : "MEDIUM";
            double score = Math.min(100, 50 + (silentHours < 0 ? 72 : silentHours) * 0.4);
            RiskItem item = RiskItem.create(RiskType.OUTSOURCE, severity, score);
            item.setOrderId(orderId);
            item.setFactoryId(factoryId);
            item.setDescription(description);
            item.setSuggestedAction("联系外发工厂确认生产状态，必要时安排现场跟单或转厂");
            item.getMetadata().put("factoryType", "EXTERNAL");
            item.getMetadata().put("silentHours", silentHours);
            item.getMetadata().put("lastScanTime", lastScanTimeObj != null ? lastScanTimeObj.toString() : "never");
            items.add(item);
        }
        return items;
    }
}
