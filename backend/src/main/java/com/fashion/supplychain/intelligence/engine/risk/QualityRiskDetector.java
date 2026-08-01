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
public class QualityRiskDetector implements RiskDetector {

    private final ProductionOrderMapper orderMapper;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public RiskType getType() { return RiskType.QUALITY; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        java.time.LocalDateTime threeMonthsAgo = java.time.LocalDateTime.now().minusMonths(3);
        List<ProductionOrder> orders = orderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                                ProductionOrder::getStatus, ProductionOrder::getRemarks)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .ge(ProductionOrder::getUpdateTime, threeMonthsAgo)
                        .last("LIMIT 500"));
        if (orders.isEmpty()) return List.of();

        // P0修复：基于ScanRecord统计次品率，按order_id分组
        Map<String, OrderQualityStat> statByOrderId = queryQualityStats(tenantId, threeMonthsAgo);

        List<RiskItem> items = new ArrayList<>();
        for (ProductionOrder o : orders) {
            // 优先：基于ScanRecord统计次品率>15%触发
            OrderQualityStat stat = statByOrderId.get(o.getId());
            if (stat != null && stat.total > 0) {
                double failRate = (double) stat.failCount / stat.total * 100;
                if (failRate > 15.0) {
                    String severity = failRate >= 40 ? "CRITICAL"
                            : failRate >= 25 ? "HIGH" : "MEDIUM";
                    double score = Math.min(100, 50 + failRate);
                    RiskItem item = RiskItem.create(RiskType.QUALITY, severity, score);
                    item.setOrderId(o.getId());
                    item.setDescription("订单 " + o.getOrderNo() + " 质检次品率 "
                            + String.format("%.1f", failRate) + "%（" + stat.failCount + "/"
                            + stat.total + "）");
                    item.setSuggestedAction("联系工厂质控部门，要求返工或重新生产");
                    item.getMetadata().put("failRate", failRate);
                    item.getMetadata().put("failCount", stat.failCount);
                    item.getMetadata().put("totalScans", stat.total);
                    items.add(item);
                    continue;
                }
            }

            // 兜底：基于订单状态/备注字符串匹配（无质检扫码记录时）
            String status = o.getStatus() != null ? o.getStatus() : "";
            String remarks = o.getRemarks() != null ? o.getRemarks() : "";
            boolean qualityIssue = status.contains("返工") || status.contains("REWORK")
                    || status.contains("不合格") || status.contains("UNQUALIFIED")
                    || remarks.contains("次品") || remarks.contains("返修") || remarks.contains("质量问题");
            if (qualityIssue) {
                RiskItem item = RiskItem.create(RiskType.QUALITY, "HIGH", 80.0);
                item.setOrderId(o.getId());
                item.setDescription("订单 " + o.getOrderNo() + " 存在质量问题：需要返工/次品/返修");
                item.setSuggestedAction("联系工厂质控部门，要求返工或重新生产");
                item.getMetadata().put("status", status);
                items.add(item);
            }
        }
        return items;
    }

    /** 查询质检扫码统计（按order_id分组，统计失败率） */
    private Map<String, OrderQualityStat> queryQualityStats(Long tenantId, java.time.LocalDateTime since) {
        String sql = "SELECT order_id, " +
                "COUNT(*) AS total, " +
                "SUM(CASE WHEN scan_result IN ('failure', 'fail') THEN 1 ELSE 0 END) AS failCount " +
                "FROM t_scan_record " +
                "WHERE tenant_id = ? AND scan_type = 'quality' " +
                "AND scan_time >= ? " +
                "GROUP BY order_id";
        List<OrderQualityStat> stats = jdbcTemplate.query(sql, (rs, rowNum) -> {
            OrderQualityStat s = new OrderQualityStat();
            s.orderId = rs.getString("order_id");
            s.total = rs.getInt("total");
            s.failCount = rs.getInt("failCount");
            return s;
        }, tenantId, since);
        Map<String, OrderQualityStat> map = new HashMap<>();
        for (OrderQualityStat s : stats) {
            map.put(s.orderId, s);
        }
        return map;
    }

    /** 质检统计内部类 */
    private static class OrderQualityStat {
        String orderId;
        int total;
        int failCount;
    }
}
