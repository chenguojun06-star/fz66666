package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.response.OrderAnalyticsVO;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 订单智能数据分析编排器（只读聚合，无事务写操作）
 * <p>数据源：t_production_order（下单/交期/完成/金额/成本）、t_scan_record（质检扫码次品率）。</p>
 * <p>全部查询强制 tenant_id（P0 铁律 4）。</p>
 * <p>D-324：工厂账号不再整体返回空（此前页面上表现为"数据分析全是 0"，用户以为数据没连接），
 * 改为只统计本工厂（factory_id 隔离）；SQL 异常直接向上抛出，由全局异常处理器返回错误，
 * 前端显示"加载失败"，绝不静默返回假 0。</p>
 */
@Service
@RequiredArgsConstructor
public class OrderAnalyticsOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(OrderAnalyticsOrchestrator.class);

    private final JdbcTemplate jdbcTemplate;

    private static final String QUALITY_FAIL = "scan_result IN ('failure','fail')";

    public OrderAnalyticsVO getAnalytics(int days) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return emptyVO();
        }
        // 工厂账号只看本工厂；其余账号看全租户
        String factoryId = DataPermissionHelper.isFactoryAccount() ? UserContext.factoryId() : null;
        LocalDateTime since = LocalDateTime.now().minusDays(clampDays(days));
        OrderAnalyticsVO vo = new OrderAnalyticsVO();
        vo.setOverview(buildOverview(tenantId, factoryId, since));
        vo.setTrend(buildTrend(tenantId, factoryId, since));
        vo.setFactoryRanking(buildFactoryRanking(tenantId, factoryId, since));
        vo.setDefectRanking(buildDefectRanking(tenantId, factoryId, since));
        vo.setMargin(buildMargin(tenantId, factoryId, since));
        // D-324: 留痕口径（租户/工厂范围/单量），便于"页面显示 0"类问题的远程排查
        log.info("[订单分析] tenantId={}, factoryScope={}, days={}, orderCount={}, totalQuantity={}",
                tenantId, StringUtils.hasText(factoryId) ? factoryId : "ALL", days,
                vo.getOverview().getOrderCount(), vo.getOverview().getTotalQuantity());
        return vo;
    }

    private OrderAnalyticsVO emptyVO() {
        OrderAnalyticsVO vo = new OrderAnalyticsVO();
        vo.setOverview(new OrderAnalyticsVO.Overview());
        vo.setTrend(new ArrayList<>());
        vo.setFactoryRanking(new ArrayList<>());
        vo.setDefectRanking(new ArrayList<>());
        vo.setMargin(new OrderAnalyticsVO.Margin());
        return vo;
    }

    private int clampDays(int days) {
        return Math.max(1, Math.min(days <= 0 ? 365 : days, 3650));
    }

    /** 工厂过滤片段（工厂账号追加 factory_id 条件） */
    private String factoryFilter(String factoryId) {
        return StringUtils.hasText(factoryId) ? " AND factory_id = ?" : "";
    }

    /** ① 总览：订单数/件数/金额/在产/完成/逾期 + 平均完工天数 + 平均次品率 */
    private OrderAnalyticsVO.Overview buildOverview(Long tenantId, String factoryId, LocalDateTime since) {
        OrderAnalyticsVO.Overview o = new OrderAnalyticsVO.Overview();
        String sql = "SELECT COUNT(*) AS orderCount, " +
                "COALESCE(SUM(order_quantity),0) AS totalQuantity, " +
                "COALESCE(SUM(order_quantity * COALESCE(order_unit_price,0)),0) AS totalAmount, " +
                "COALESCE(SUM(CASE WHEN status IN ('pending','production') THEN 1 ELSE 0 END),0) AS inProductionCount, " +
                "COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END),0) AS completedCount, " +
                "COALESCE(SUM(CASE WHEN planned_end_date IS NOT NULL AND planned_end_date < NOW() " +
                "AND status NOT IN ('completed','cancelled','closed','archived','scrapped') THEN 1 ELSE 0 END),0) AS overdueCount " +
                "FROM t_production_order WHERE tenant_id = ? AND delete_flag = 0" +
                factoryFilter(factoryId) + " AND create_time >= ?";
        Object[] args = StringUtils.hasText(factoryId)
                ? new Object[]{tenantId, factoryId, since}
                : new Object[]{tenantId, since};
        jdbcTemplate.query(sql, rs -> {
            o.setOrderCount(rs.getLong("orderCount"));
            o.setTotalQuantity(rs.getLong("totalQuantity"));
            o.setTotalAmount(round2(rs.getDouble("totalAmount")));
            o.setInProductionCount(rs.getLong("inProductionCount"));
            o.setCompletedCount(rs.getLong("completedCount"));
            o.setOverdueCount(rs.getLong("overdueCount"));
            return null;
        }, args);
        o.setAvgCompletionDays(round1(queryAvgCompletionDays(tenantId, factoryId, since)));
        o.setAvgDefectRate(round1(queryAvgDefectRate(tenantId, factoryId, since)));
        return o;
    }

    private double queryAvgCompletionDays(Long tenantId, String factoryId, LocalDateTime since) {
        Double v = jdbcTemplate.queryForObject(
                "SELECT AVG(DATEDIFF(actual_end_date, create_time)) FROM t_production_order " +
                        "WHERE tenant_id = ? AND delete_flag = 0 AND status = 'completed' " +
                        "AND actual_end_date IS NOT NULL AND create_time IS NOT NULL AND create_time >= ?" +
                        factoryFilter(factoryId),
                Double.class, StringUtils.hasText(factoryId)
                        ? new Object[]{tenantId, since, factoryId}
                        : new Object[]{tenantId, since});
        return v == null ? -1 : v;
    }

    private double queryAvgDefectRate(Long tenantId, String factoryId, LocalDateTime since) {
        return jdbcTemplate.query(
                "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN " + QUALITY_FAIL + " THEN 1 ELSE 0 END),0) AS failCount " +
                        "FROM t_scan_record WHERE tenant_id = ? AND scan_type = 'quality' AND scan_time >= ?" +
                        factoryFilter(factoryId),
                rs -> {
                    long total = rs.getLong("total");
                    long fail = rs.getLong("failCount");
                    return total > 0 ? fail * 100.0 / total : -1;
                }, StringUtils.hasText(factoryId)
                        ? new Object[]{tenantId, since, factoryId}
                        : new Object[]{tenantId, since});
    }

    /** ② 近30天下单趋势（按日聚合，缺日由前端补零） */
    private List<OrderAnalyticsVO.TrendItem> buildTrend(Long tenantId, String factoryId, LocalDateTime since) {
        return jdbcTemplate.query(
                "SELECT DATE_FORMAT(create_time,'%Y-%m-%d') AS date, COUNT(*) AS orderCount, " +
                        "COALESCE(SUM(order_quantity),0) AS quantity " +
                        "FROM t_production_order WHERE tenant_id = ? AND delete_flag = 0" +
                        factoryFilter(factoryId) + " AND create_time >= ? " +
                        "GROUP BY DATE_FORMAT(create_time,'%Y-%m-%d') ORDER BY date",
                (rs, i) -> OrderAnalyticsVO.TrendItem.builder()
                        .date(rs.getString("date"))
                        .orderCount(rs.getLong("orderCount"))
                        .quantity(rs.getLong("quantity"))
                        .build(), StringUtils.hasText(factoryId)
                        ? new Object[]{tenantId, factoryId, since}
                        : new Object[]{tenantId, since});
    }

    /** ③ 工厂时效排行：平均完工天数 + 准时交付率（按完成单统计） */
    private List<OrderAnalyticsVO.FactoryRankItem> buildFactoryRanking(Long tenantId, String factoryId, LocalDateTime since) {
        List<OrderAnalyticsVO.FactoryRankItem> list = jdbcTemplate.query(
                "SELECT factory_name, COUNT(*) AS completedOrders, " +
                        "COALESCE(AVG(CASE WHEN actual_end_date IS NOT NULL AND create_time IS NOT NULL THEN DATEDIFF(actual_end_date, create_time) END),-1) AS avgDays, " +
                        "COALESCE(SUM(CASE WHEN actual_end_date IS NOT NULL AND planned_end_date IS NOT NULL " +
                        "AND actual_end_date <= planned_end_date THEN 1 ELSE 0 END) * 100.0 / " +
                        "NULLIF(SUM(CASE WHEN actual_end_date IS NOT NULL AND planned_end_date IS NOT NULL THEN 1 ELSE 0 END),0),-1) AS onTimeRate " +
                        "FROM t_production_order WHERE tenant_id = ? AND delete_flag = 0 AND status = 'completed' " +
                        "AND factory_name IS NOT NULL AND factory_name <> '' AND create_time >= ?" +
                        factoryFilter(factoryId) +
                        " GROUP BY factory_name",
                (rs, i) -> {
                    OrderAnalyticsVO.FactoryRankItem item = new OrderAnalyticsVO.FactoryRankItem();
                    item.setFactoryName(rs.getString("factory_name"));
                    item.setCompletedOrders(rs.getLong("completedOrders"));
                    item.setAvgCompletionDays(round1(rs.getDouble("avgDays")));
                    item.setOnTimeRate(round1(rs.getDouble("onTimeRate")));
                    return item;
                }, StringUtils.hasText(factoryId)
                        ? new Object[]{tenantId, since, factoryId}
                        : new Object[]{tenantId, since});
        list.sort(Comparator.comparingDouble(OrderAnalyticsVO.FactoryRankItem::getAvgCompletionDays));
        return list.size() > 20 ? new ArrayList<>(list.subList(0, 20)) : list;
    }

    /** ④ 次品率排行：按款号聚合质检扫码（t_scan_record 无 style_name 列，款名由 t_style_info 补全） */
    private List<OrderAnalyticsVO.DefectRankItem> buildDefectRanking(Long tenantId, String factoryId, LocalDateTime since) {
        List<OrderAnalyticsVO.DefectRankItem> list = jdbcTemplate.query(
                "SELECT style_no, COUNT(*) AS total, " +
                        "COALESCE(SUM(CASE WHEN " + QUALITY_FAIL + " THEN 1 ELSE 0 END),0) AS failCount " +
                        "FROM t_scan_record WHERE tenant_id = ? AND scan_type = 'quality' " +
                        "AND style_no IS NOT NULL AND style_no <> '' AND scan_time >= ?" +
                        factoryFilter(factoryId) +
                        " GROUP BY style_no",
                (rs, i) -> {
                    OrderAnalyticsVO.DefectRankItem item = new OrderAnalyticsVO.DefectRankItem();
                    long total = rs.getLong("total");
                    long fail = rs.getLong("failCount");
                    item.setStyleNo(rs.getString("style_no"));
                    item.setTotal(total);
                    item.setFailCount(fail);
                    item.setDefectRate(total > 0 ? round2(fail * 100.0 / total) : 0);
                    return item;
                }, StringUtils.hasText(factoryId)
                        ? new Object[]{tenantId, since, factoryId}
                        : new Object[]{tenantId, since});
        list.sort(Comparator.comparingLong(OrderAnalyticsVO.DefectRankItem::getFailCount).reversed());
        List<OrderAnalyticsVO.DefectRankItem> top = list.size() > 20 ? new ArrayList<>(list.subList(0, 20)) : list;
        enrichDefectStyleNames(tenantId, top);
        return top;
    }

    /** 按款号批量补款式名（扫码表不存款名，直接查 t_style_info） */
    private void enrichDefectStyleNames(Long tenantId, List<OrderAnalyticsVO.DefectRankItem> items) {
        if (items == null || items.isEmpty()) return;
        List<String> styleNos = items.stream()
                .map(OrderAnalyticsVO.DefectRankItem::getStyleNo)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(java.util.stream.Collectors.toList());
        if (styleNos.isEmpty()) return;
        String in = String.join(",", java.util.Collections.nCopies(styleNos.size(), "?"));
        Object[] args = java.util.stream.Stream.concat(
                java.util.stream.Stream.of(tenantId), styleNos.stream()).toArray();
        Map<String, String> nameMap = new java.util.HashMap<>();
        try {
            jdbcTemplate.query(
                    "SELECT style_no, style_name FROM t_style_info WHERE tenant_id = ? AND delete_flag = 0 AND style_no IN (" + in + ")",
                    rs -> {
                        nameMap.put(rs.getString("style_no"), rs.getString("style_name"));
                        return null;
                    }, args);
        } catch (Exception e) {
            log.warn("[订单分析] 次品率排行款名补全失败（不影响排行）: {}", e.getMessage());
            return;
        }
        items.forEach(item -> {
            String name = nameMap.get(item.getStyleNo());
            if (name != null) item.setStyleName(name);
        });
    }

    /** ⑤ 毛利估算：销售额 - 总成本（优先 total_cost，兜底 material_cost） */
    private OrderAnalyticsVO.Margin buildMargin(Long tenantId, String factoryId, LocalDateTime since) {
        OrderAnalyticsVO.Margin m = new OrderAnalyticsVO.Margin();
        jdbcTemplate.query(
                "SELECT COALESCE(SUM(order_quantity * COALESCE(order_unit_price,0)),0) AS salesAmount, " +
                        "COALESCE(SUM(COALESCE(material_cost,0)),0) AS materialCost, " +
                        "COALESCE(SUM(COALESCE(total_cost,0)),0) AS totalCost " +
                        "FROM t_production_order WHERE tenant_id = ? AND delete_flag = 0" +
                        factoryFilter(factoryId) + " AND create_time >= ?",
                rs -> {
                    double sales = rs.getDouble("salesAmount");
                    double totalCost = rs.getDouble("totalCost");
                    double materialCost = rs.getDouble("materialCost");
                    double cost = totalCost > 0 ? totalCost : materialCost;
                    m.setSalesAmount(round2(sales));
                    m.setMaterialCost(round2(materialCost));
                    m.setGrossProfit(round2(sales - cost));
                    m.setHasCostData(cost > 0);
                    m.setGrossMarginRate(cost > 0 && sales > 0 ? round2((sales - cost) * 100.0 / sales) : -1);
                    return null;
                }, StringUtils.hasText(factoryId)
                        ? new Object[]{tenantId, factoryId, since}
                        : new Object[]{tenantId, since});
        return m;
    }

    private double round1(double v) {
        return v < 0 ? v : Math.round(v * 10.0) / 10.0;
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
