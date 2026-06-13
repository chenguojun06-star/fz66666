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
            // 注意：t_factory 中的 overall_score/completion_rate/total_orders 对历史数据可能为 NULL。
            // 使用 COALESCE 让 NULL 显式参与比较/排序：
            //   - COALESCE(f.overall_score, 0) DESC：无评分的供应商稳定排在最后
            //   - COALESCE(f.total_orders, 0)：避免 NULL > 0 的 UNKNOWN 语义
            // 关联字段：t_material_purchase 用 supplier_id 关联 t_factory.id（不是 factory_id）
            String sql = "SELECT f.factory_name AS supplier_name, f.contact_person, "
                    + "COALESCE(f.total_orders, 0) AS total_orders, "
                    + "f.on_time_delivery_rate AS on_time_rate, "
                    + "f.quality_score AS avg_quality, "
                    + "f.overall_score, "
                    + "f.completion_rate, "
                    + "ROUND(AVG(p.unit_price), 2) AS avg_price, "
                    + "COUNT(p.id) AS purchase_record_count "
                    + "FROM t_factory f "
                    + "LEFT JOIN t_material_purchase p ON f.id = p.supplier_id AND p.tenant_id = ? "
                    + "WHERE f.tenant_id = ? AND f.factory_type IN ('supplier', 'both') "
                    + "AND (COALESCE(f.total_orders, 0) > 0 OR p.id IS NOT NULL) "
                    + "GROUP BY f.id, f.factory_name, f.contact_person, f.total_orders, "
                    + "f.on_time_delivery_rate, f.quality_score, f.overall_score, f.completion_rate "
                    + "ORDER BY COALESCE(f.overall_score, 0) DESC, COALESCE(f.on_time_delivery_rate, 0) DESC "
                    + "LIMIT 20";

            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId, tenantId);
            for (Map<String, Object> row : rows) {
                Map<String, Object> card = new LinkedHashMap<>();
                card.put("supplierName", row.get("supplier_name"));
                card.put("contactPerson", row.get("contact_person"));
                card.put("totalOrders", toSafeNumber(row.get("total_orders")));
                card.put("purchaseRecordCount", toSafeNumber(row.get("purchase_record_count")));
                card.put("onTimeRate", toSafeNumber(row.get("on_time_rate")));
                card.put("avgQuality", toSafeNumber(row.get("avg_quality")));
                card.put("completionRate", toSafeNumber(row.get("completion_rate")));
                card.put("avgPrice", toSafeNumber(row.get("avg_price")));
                // 综合评分：优先用 factory.overall_score，否则用 on_time_rate * 0.4 + quality_score * 0.4 + price_score * 0.2
                double composite;
                Object overallScoreObj = row.get("overall_score");
                if (overallScoreObj instanceof Number) {
                    composite = ((Number) overallScoreObj).doubleValue();
                } else {
                    double onTime = numberOrZero(row.get("on_time_rate"));
                    double quality = numberOrZero(row.get("avg_quality"));
                    double priceVal = numberOrZero(row.get("avg_price"));
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

    /**
     * 安全地把任意 JDBC 返回的对象转为 Number（统一为 Long/Double 以便前端消费）。
     * NULL 或非 Number 类型返回 0；BigDecimal/Integer/Long 都会保留数值语义。
     */
    private static Number toSafeNumber(Object o) {
        if (o == null) return 0;
        if (o instanceof Number) {
            Number n = (Number) o;
            double d = n.doubleValue();
            // 整数类型用 long，浮点类型用 double（避免 JSON 序列化时出现 .0）
            if (d == Math.floor(d) && !Double.isInfinite(d)
                    && (o instanceof Long || o instanceof Integer || o instanceof Short || o instanceof Byte)) {
                return n.longValue();
            }
            return d;
        }
        return 0;
    }

    private static double numberOrZero(Object o) {
        if (o instanceof Number) return ((Number) o).doubleValue();
        return 0.0;
    }
}
