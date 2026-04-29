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

@Slf4j
@Service
public class ProcurementIntelligenceOrchestrator {

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    public List<Map<String, Object>> getSupplierScorecard() {
        List<Map<String, Object>> scorecards = new ArrayList<>();
        if (jdbcTemplate == null) return scorecards;
        try {
            Long tenantId = UserContext.tenantId();
            String sql = "SELECT s.supplier_name, s.contact_person, "
                    + "COUNT(p.id) AS total_orders, "
                    + "SUM(CASE WHEN p.delivery_status = 'on_time' THEN 1 ELSE 0 END) AS on_time_count, "
                    + "ROUND(AVG(CASE WHEN p.quality_score IS NOT NULL THEN p.quality_score ELSE 0 END), 1) AS avg_quality, "
                    + "ROUND(AVG(p.unit_price), 2) AS avg_price, "
                    + "ROUND(SUM(CASE WHEN p.delivery_status = 'on_time' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(p.id), 0), 1) AS on_time_rate "
                    + "FROM t_supplier s "
                    + "LEFT JOIN t_material_purchase_record p ON s.id = p.supplier_id AND p.tenant_id = ? "
                    + "WHERE s.tenant_id = ? "
                    + "GROUP BY s.id, s.supplier_name, s.contact_person "
                    + "HAVING total_orders > 0 "
                    + "ORDER BY on_time_rate DESC, avg_quality DESC "
                    + "LIMIT 20";

            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId, tenantId);
            for (Map<String, Object> row : rows) {
                Map<String, Object> card = new LinkedHashMap<>();
                card.put("supplierName", row.get("supplier_name"));
                card.put("contactPerson", row.get("contact_person"));
                card.put("totalOrders", row.get("total_orders"));
                card.put("onTimeRate", row.get("on_time_rate"));
                card.put("avgQuality", row.get("avg_quality"));
                card.put("avgPrice", row.get("avg_price"));
                double onTime = row.get("on_time_rate") != null ? ((Number) row.get("on_time_rate")).doubleValue() : 0;
                double quality = row.get("avg_quality") != null ? ((Number) row.get("avg_quality")).doubleValue() : 0;
                double composite = onTime * 0.4 + quality * 0.4 + Math.max(0, 100 - (row.get("avg_price") != null ? ((Number) row.get("avg_price")).doubleValue() : 0)) * 0.2;
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
                    + "FROM t_material_purchase_record p "
                    + "JOIN t_material_info m ON p.material_id = m.id "
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
