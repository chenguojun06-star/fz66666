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
public class WarehouseIntelligenceOrchestrator {

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    public List<Map<String, Object>> checkSafetyStockAlerts() {
        List<Map<String, Object>> alerts = new ArrayList<>();
        if (jdbcTemplate == null) return alerts;
        try {
            Long tenantId = UserContext.tenantId();
            String sql = "SELECT m.material_name, m.material_code, m.specification, "
                    + "COALESCE(SUM(i.quantity), 0) AS current_stock, "
                    + "COALESCE(AVG(d.daily_consumption), 0) AS avg_daily_consumption, "
                    + "COALESCE(AVG(d.lead_time_days), 14) AS avg_lead_time_days "
                    + "FROM t_material_info m "
                    + "LEFT JOIN t_material_inventory i ON m.id = i.material_id AND i.tenant_id = ? "
                    + "LEFT JOIN ( "
                    + "  SELECT material_id, AVG(daily_qty) AS daily_consumption, AVG(lead_days) AS lead_time_days "
                    + "  FROM ( "
                    + "    SELECT material_id, "
                    + "      GREATEST(1, DATEDIFF(COALESCE(MAX(created_at), NOW()), MIN(created_at))) AS span_days, "
                    + "      SUM(quantity) AS daily_qty, "
                    + "      14 AS lead_days "
                    + "    FROM t_material_purchase_record WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) "
                    + "    GROUP BY material_id "
                    + "  ) sub "
                    + ") d ON m.id = d.material_id "
                    + "WHERE m.tenant_id = ? "
                    + "GROUP BY m.id, m.material_name, m.material_code, m.specification "
                    + "HAVING avg_daily_consumption > 0 "
                    + "AND current_stock < avg_daily_consumption * avg_lead_time_days * 1.5 "
                    + "ORDER BY (current_stock / GREATEST(avg_daily_consumption * avg_lead_time_days, 1)) ASC "
                    + "LIMIT 20";

            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId, tenantId, tenantId);
            for (Map<String, Object> row : rows) {
                Map<String, Object> alert = new LinkedHashMap<>();
                alert.put("materialName", row.get("material_name"));
                alert.put("materialCode", row.get("material_code"));
                alert.put("specification", row.get("specification"));
                alert.put("currentStock", row.get("current_stock"));
                alert.put("avgDailyConsumption", row.get("avg_daily_consumption"));
                alert.put("avgLeadTimeDays", row.get("avg_lead_time_days"));
                double stock = ((Number) row.get("current_stock")).doubleValue();
                double consumption = ((Number) row.get("avg_daily_consumption")).doubleValue();
                double leadTime = ((Number) row.get("avg_lead_time_days")).doubleValue();
                double safetyStock = consumption * leadTime * 1.5;
                alert.put("safetyStockThreshold", Math.round(safetyStock * 100.0) / 100.0);
                alert.put("stockDaysRemaining", consumption > 0 ? Math.round(stock / consumption * 10.0) / 10.0 : 999);
                alert.put("alertLevel", stock < safetyStock * 0.5 ? "critical" : "warning");
                alerts.add(alert);
            }
        } catch (Exception e) {
            log.warn("[仓库智能] 安全库存检查失败: {}", e.getMessage());
        }
        return alerts;
    }

    public List<Map<String, Object>> checkExpiryAlerts() {
        List<Map<String, Object>> alerts = new ArrayList<>();
        if (jdbcTemplate == null) return alerts;
        try {
            Long tenantId = UserContext.tenantId();
            String sql = "SELECT m.material_name, m.material_code, i.batch_no, "
                    + "i.quantity, i.expiry_date, i.warehouse_location "
                    + "FROM t_material_inventory i "
                    + "JOIN t_material_info m ON i.material_id = m.id "
                    + "WHERE i.tenant_id = ? "
                    + "AND i.expiry_date IS NOT NULL "
                    + "AND i.expiry_date <= DATE_ADD(NOW(), INTERVAL 30 DAY) "
                    + "AND i.quantity > 0 "
                    + "ORDER BY i.expiry_date ASC "
                    + "LIMIT 20";

            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId);
            for (Map<String, Object> row : rows) {
                Map<String, Object> alert = new LinkedHashMap<>();
                alert.put("materialName", row.get("material_name"));
                alert.put("materialCode", row.get("material_code"));
                alert.put("batchNo", row.get("batch_no"));
                alert.put("quantity", row.get("quantity"));
                alert.put("expiryDate", row.get("expiry_date"));
                alert.put("warehouseLocation", row.get("warehouse_location"));
                alerts.add(alert);
            }
        } catch (Exception e) {
            log.warn("[仓库智能] 过期预警检查失败: {}", e.getMessage());
        }
        return alerts;
    }
}
