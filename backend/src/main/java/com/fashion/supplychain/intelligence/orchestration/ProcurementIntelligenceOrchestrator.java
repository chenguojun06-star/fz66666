package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

@Slf4j
@Service
@Lazy
public class ProcurementIntelligenceOrchestrator {

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    public List<Map<String, Object>> getSupplierScorecard() {
        List<Map<String, Object>> scorecards = new ArrayList<>();
        if (jdbcTemplate == null) return scorecards;
        try {
            Long tenantId = UserContext.tenantId();
            String sql = "SELECT f.factory_name AS supplier_name, f.contact_person, "
                    + "f.total_orders, "
                    + "f.on_time_delivery_rate AS on_time_rate, "
                    + "f.quality_score AS avg_quality, "
                    + "f.overall_score, "
                    + "f.completion_rate, "
                    + "ROUND(AVG(p.unit_price), 2) AS avg_price, "
                    + "COUNT(p.id) AS purchase_record_count "
                    + "FROM t_factory f "
                    + "LEFT JOIN t_material_purchase p ON f.id = p.factory_id AND p.tenant_id = ? "
                    + "WHERE f.tenant_id = ? AND f.factory_type IN ('supplier', 'both') "
                    + "GROUP BY f.id, f.factory_name, f.contact_person, f.total_orders, "
                    + "f.on_time_delivery_rate, f.quality_score, f.overall_score, f.completion_rate "
                    + "HAVING f.total_orders > 0 OR COUNT(p.id) > 0 "
                    + "ORDER BY f.overall_score DESC, f.on_time_delivery_rate DESC "
                    + "LIMIT 20";

            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId, tenantId);
            for (Map<String, Object> row : rows) {
                Map<String, Object> card = new LinkedHashMap<>();
                card.put("supplierName", row.get("supplier_name"));
                card.put("contactPerson", row.get("contact_person"));
                card.put("totalOrders", row.get("total_orders"));
                card.put("purchaseRecordCount", row.get("purchase_record_count"));
                card.put("onTimeRate", row.get("on_time_rate"));
                card.put("avgQuality", row.get("avg_quality"));
                card.put("completionRate", row.get("completion_rate"));
                card.put("avgPrice", row.get("avg_price"));
                // 综合评分：优先用 factory.overall_score，否则用 on_time_rate * 0.4 + quality_score * 0.4 + price_score * 0.2
                double composite;
                if (row.get("overall_score") != null) {
                    composite = ((Number) row.get("overall_score")).doubleValue();
                } else {
                    double onTime = row.get("on_time_rate") != null ? ((Number) row.get("on_time_rate")).doubleValue() : 0;
                    double quality = row.get("avg_quality") != null ? ((Number) row.get("avg_quality")).doubleValue() : 0;
                    double priceVal = row.get("avg_price") != null ? ((Number) row.get("avg_price")).doubleValue() : 0;
                    composite = onTime * 0.4 + quality * 0.4 + Math.max(0, 100 - priceVal) * 0.2;
                }
                card.put("compositeScore", Math.round(composite * 10.0) / 10.0);
                card.put("recommendation", composite >= 80 ? "优选" : composite >= 60 ? "合格" : "待改进");
                scorecards.add(card);
            }
        } catch (Exception e) {
            log.warn("[采购智能] 供应商评分失败: {}", e.getMessage());
        }
        return scorecards;
    }

    public List<Map<String, Object>> getPriceTrend(String materialCode) {
        List<Map<String, Object>> trend = new ArrayList<>();
        if (jdbcTemplate == null) return trend;
        try {
            Long tenantId = UserContext.tenantId();
            String sql = "SELECT DATE_FORMAT(p.created_at, '%Y-%m') AS month, "
                    + "ROUND(AVG(p.unit_price), 2) AS avg_price, "
                    + "ROUND(MIN(p.unit_price), 2) AS min_price, "
                    + "ROUND(MAX(p.unit_price), 2) AS max_price, "
                    + "COUNT(*) AS sample_count "
                    + "FROM t_material_purchase p "
                    + "JOIN t_material_database m ON p.material_id = m.id "
                    + "WHERE p.tenant_id = ? "
                    + "AND m.material_code = ? "
                    + "AND p.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH) "
                    + "GROUP BY DATE_FORMAT(p.created_at, '%Y-%m') "
                    + "ORDER BY month ASC";

            trend = jdbcTemplate.queryForList(sql, tenantId, materialCode);
        } catch (Exception e) {
            log.warn("[采购智能] 价格走势查询失败: {}", e.getMessage());
        }
        return trend;
    }
}
