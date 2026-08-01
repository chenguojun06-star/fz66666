package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
@Lazy
@RequiredArgsConstructor
public class CostRiskDetector implements RiskDetector {

    private final ProductionOrderMapper orderMapper;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public RiskType getType() { return RiskType.COST; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        List<RiskItem> items = new ArrayList<>();

        // 维度1：报价超预算检测（保留原有逻辑）
        items.addAll(detectQuotationOverrun(tenantId));

        // P1新增维度2：工时>标准2倍检测
        items.addAll(detectWorkTimeOverrun(tenantId));

        return items;
    }

    /** 维度1：报价超预算检测 */
    private List<RiskItem> detectQuotationOverrun(Long tenantId) {
        java.time.LocalDateTime threeMonthsAgo = java.time.LocalDateTime.now().minusMonths(3);
        List<ProductionOrder> orders = orderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                                ProductionOrder::getFactoryUnitPrice, ProductionOrder::getFactoryId)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .ge(ProductionOrder::getUpdateTime, threeMonthsAgo)
                        .last("LIMIT 500"));
        if (orders.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        for (ProductionOrder o : orders) {
            java.math.BigDecimal quotation = o.getQuotationUnitPrice();
            java.math.BigDecimal actual = o.getFactoryUnitPrice();
            if (quotation == null || actual == null) continue;
            if (quotation.signum() <= 0) continue;
            double ratio = actual.divide(quotation, 4, java.math.RoundingMode.HALF_UP).doubleValue();
            if (ratio > 1.10) {
                String severity = ratio > 1.30 ? "CRITICAL" : ratio > 1.20 ? "HIGH" : "MEDIUM";
                RiskItem item = RiskItem.create(RiskType.COST, severity, Math.min(100, 60 + (ratio - 1.0) * 200));
                item.setOrderId(o.getId());
                item.setFactoryId(o.getFactoryId());
                item.setDescription("订单 " + o.getOrderNo() + " 工厂报价超出预算 "
                        + String.format("%.1f", (ratio - 1) * 100) + "%");
                item.setSuggestedAction("核查成本明细，联系工厂协商分摊或调整报价");
                item.getMetadata().put("dimension", "quotationOverrun");
                item.getMetadata().put("quotationUnitPrice", quotation);
                item.getMetadata().put("factoryUnitPrice", actual);
                item.getMetadata().put("overrunRatio", ratio);
                items.add(item);
            }
        }
        return items;
    }

    /**
     * 维度2：工时>标准2倍检测
     * ScanRecord无standard_time字段，用同工序平均工时作为基准
     * 实际工时(receive_time→confirm_time) > 2 × 同工序平均工时 即触发
     */
    private List<RiskItem> detectWorkTimeOverrun(Long tenantId) {
        java.time.LocalDateTime threeMonthsAgo = java.time.LocalDateTime.now().minusMonths(3);
        // 查询工时超标的扫码记录（实际工时 > 2倍工序平均工时，且实际工时>30分钟过滤噪音）
        String sql = "SELECT sr.order_id, sr.order_no, sr.process_code, sr.process_name, " +
                "TIMESTAMPDIFF(MINUTE, sr.receive_time, sr.confirm_time) AS actualMinutes, " +
                "avg_stats.avg_minutes AS standardMinutes " +
                "FROM t_scan_record sr " +
                "JOIN ( " +
                "  SELECT process_code, AVG(TIMESTAMPDIFF(MINUTE, receive_time, confirm_time)) AS avg_minutes " +
                "  FROM t_scan_record " +
                "  WHERE tenant_id = ? AND receive_time IS NOT NULL AND confirm_time IS NOT NULL " +
                "    AND scan_result = 'success' AND receive_time < confirm_time AND scan_time >= ? " +
                "  GROUP BY process_code HAVING COUNT(*) >= 3 " +
                ") avg_stats ON sr.process_code = avg_stats.process_code " +
                "WHERE sr.tenant_id = ? " +
                "  AND sr.receive_time IS NOT NULL AND sr.confirm_time IS NOT NULL " +
                "  AND sr.scan_result = 'success' AND sr.receive_time < sr.confirm_time " +
                "  AND sr.scan_time >= ? " +
                "  AND TIMESTAMPDIFF(MINUTE, sr.receive_time, sr.confirm_time) > 2 * avg_stats.avg_minutes " +
                "  AND TIMESTAMPDIFF(MINUTE, sr.receive_time, sr.confirm_time) > 30 " +
                "ORDER BY actualMinutes DESC LIMIT 100";

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId, threeMonthsAgo, tenantId, threeMonthsAgo);

        // 按order_id聚合（同一订单多个工序超标只取最高）
        Map<String, Map<String, Object>> worstByOrder = new HashMap<>();
        for (Map<String, Object> row : rows) {
            String orderId = (String) row.get("order_id");
            if (orderId == null) continue;
            Map<String, Object> existing = worstByOrder.get(orderId);
            if (existing == null
                    || ((Number) row.get("actualMinutes")).longValue() > ((Number) existing.get("actualMinutes")).longValue()) {
                worstByOrder.put(orderId, row);
            }
        }

        List<RiskItem> items = new ArrayList<>();
        for (Map<String, Object> row : worstByOrder.values()) {
            String orderId = (String) row.get("order_id");
            String orderNo = (String) row.get("order_no");
            String processName = row.get("process_name") != null ? row.get("process_name").toString() : "未知工序";
            long actualMinutes = ((Number) row.get("actualMinutes")).longValue();
            double standardMinutes = ((Number) row.get("standardMinutes")).doubleValue();
            double ratio = actualMinutes / standardMinutes;

            String severity = ratio >= 4 ? "CRITICAL" : ratio >= 3 ? "HIGH" : "MEDIUM";
            double score = Math.min(100, 60 + (ratio - 2) * 20);
            RiskItem item = RiskItem.create(RiskType.COST, severity, score);
            item.setOrderId(orderId);
            item.setDescription("订单 " + orderNo + " 工序[" + processName + "] 工时 "
                    + actualMinutes + "分钟，超标准(" + String.format("%.0f", standardMinutes)
                    + "分钟) " + String.format("%.1f", ratio) + "倍");
            item.setSuggestedAction("核查工时异常原因，重算该款式难度分并更新工时基准");
            item.getMetadata().put("dimension", "workTimeOverrun");
            item.getMetadata().put("processCode", row.get("process_code"));
            item.getMetadata().put("processName", processName);
            item.getMetadata().put("actualMinutes", actualMinutes);
            item.getMetadata().put("standardMinutes", standardMinutes);
            item.getMetadata().put("overrunRatio", ratio);
            items.add(item);
        }
        return items;
    }
}
