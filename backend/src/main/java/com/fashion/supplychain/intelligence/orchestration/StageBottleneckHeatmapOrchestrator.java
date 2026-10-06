package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.constants.ProductionConstants;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 瓶颈热力看板编排器（D-754 P2 / L1 瓶颈可视化）。
 *
 * <p>回答老板最关心的问题：「我的瓶颈在哪个环节？」——按 工厂 × 环节 横向聚合
 * 所有在制订单的相邻环节积压（前道完成 − 后道完成），再用环节历史件均耗时
 * （t_intelligence_process_stats，扫码自学习）与工厂活跃工人数折算
 * 「按当前人力还要堵几天」。三块数据全部现成，零新采集依赖。</p>
 *
 * <p>分级：预计清空 ≥3 天 = critical（红），≥1 天 = warning（黄），其余正常。</p>
 */
@Slf4j
@Service
public class StageBottleneckHeatmapOrchestrator {

    private static final List<String> STAGES = ProductionConstants.FIXED_PRODUCTION_NODES;
    private static final int CRITICAL_DAYS = 3;
    private static final int WARNING_DAYS = 1;
    private static final int MINUTES_PER_WORKER_DAY = 480;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    public Map<String, Object> heatmap() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> resp = new LinkedHashMap<>();
        List<ProductionOrder> orders = loadActiveOrders(tenantId);
        if (orders.isEmpty()) {
            resp.put("rows", List.of());
            resp.put("summary", "暂无进行中的订单，没有瓶颈可言");
            return resp;
        }

        // 全量环节完成量（一次查询，Java 侧按工厂聚合）
        List<String> orderIds = orders.stream().map(ProductionOrder::getId).collect(Collectors.toList());
        List<Map<String, Object>> aggs = scanRecordMapper.selectStageDoneAgg(orderIds, tenantId);
        Map<String, Map<String, Long>> doneByOrder = new HashMap<>();
        for (Map<String, Object> r : aggs) {
            String orderId = String.valueOf(r.get("orderId"));
            String stage = String.valueOf(r.get("stageName"));
            long done = r.get("doneQuantity") == null ? 0 : Long.parseLong(String.valueOf(r.get("doneQuantity")));
            doneByOrder.computeIfAbsent(orderId, k -> new HashMap<>()).merge(stage, done, Long::sum);
        }

        // 工厂人力与日产（近30天扫码）：工人数=不同操作员，日均产出=总量/活跃天数
        Map<String, Integer> workersByFactory = new HashMap<>();
        Map<String, Double> dailyOutputByFactory = new HashMap<>();
        buildFactoryLabor(orders, tenantId, workersByFactory, dailyOutputByFactory);

        // 环节历史件均耗时（分钟，租户级平均）
        Map<String, Double> minutesByStage = loadStageMinutes(tenantId);

        // 工厂分组
        Map<String, List<ProductionOrder>> byFactory = orders.stream()
                .collect(Collectors.groupingBy(o -> StringUtils.hasText(o.getFactoryName())
                        ? o.getFactoryName() : "未分配工厂"));

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map.Entry<String, List<ProductionOrder>> fe : byFactory.entrySet()) {
            String factoryName = fe.getKey();
            Map<String, Long> doneByStage = new HashMap<>();
            for (ProductionOrder o : fe.getValue()) {
                doneByOrder.getOrDefault(o.getId(), Map.of())
                        .forEach((stage, done) -> doneByStage.merge(stage, done, Long::sum));
            }
            int workers = workersByFactory.getOrDefault(factoryName, 0);
            double dailyOutput = dailyOutputByFactory.getOrDefault(factoryName, 0.0);

            for (int i = 1; i < STAGES.size(); i++) {
                String upstream = STAGES.get(i - 1);
                String stage = STAGES.get(i);
                long backlog = doneByStage.getOrDefault(upstream, 0L) - doneByStage.getOrDefault(stage, 0L);
                if (backlog <= 0) {
                    continue;
                }
                Double minutesPerUnit = minutesByStage.get(stage);
                Double capacityPerDay = null;
                if (minutesPerUnit != null && minutesPerUnit > 0 && workers > 0) {
                    capacityPerDay = workers * MINUTES_PER_WORKER_DAY / minutesPerUnit;
                } else if (dailyOutput > 0) {
                    capacityPerDay = dailyOutput; // 无环节耗时统计时按全厂日均产出兜底
                }
                Double estDays = capacityPerDay != null && capacityPerDay > 0
                        ? Math.ceil(backlog / capacityPerDay * 10) / 10.0 : null;

                Map<String, Object> row = new LinkedHashMap<>();
                row.put("factoryName", factoryName);
                row.put("stage", stage);
                row.put("upstreamStage", upstream);
                row.put("backlogQty", backlog);
                row.put("workers", workers);
                row.put("avgMinutesPerUnit", minutesPerUnit);
                row.put("capacityPerDay", capacityPerDay == null ? null : Math.round(capacityPerDay));
                row.put("estClearDays", estDays);
                row.put("level", estDays == null ? "WARNING" : estDays >= CRITICAL_DAYS ? "CRITICAL" : estDays >= WARNING_DAYS ? "WARNING" : "OK");
                row.put("hint", buildHint(stage, backlog, estDays, workers));
                rows.add(row);
            }
        }

        rows.sort(Comparator.comparingLong(r -> -((Number) r.get("backlogQty")).longValue()));
        resp.put("rows", rows);
        resp.put("orderCount", orders.size());
        resp.put("summary", buildSummary(rows));
        resp.put("generatedAt", LocalDateTime.now().toString());
        return resp;
    }

    private List<ProductionOrder> loadActiveOrders(Long tenantId) {
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "COMPLETED", "WAREHOUSED", "CANCELLED", "SCRAPPED", "CLOSED", "ARCHIVED")
                .list();
    }

    private void buildFactoryLabor(List<ProductionOrder> orders, Long tenantId,
                                   Map<String, Integer> workersByFactory, Map<String, Double> dailyOutputByFactory) {
        try {
            Map<String, String> orderToFactory = new HashMap<>();
            for (ProductionOrder o : orders) {
                if (StringUtils.hasText(o.getFactoryName())) {
                    orderToFactory.putIfAbsent(o.getId(), o.getFactoryName());
                }
            }
            if (orderToFactory.isEmpty()) {
                return;
            }
            List<ScanRecord> scans = scanRecordService.lambdaQuery()
                    .eq(ScanRecord::getTenantId, tenantId)
                    .in(ScanRecord::getOrderId, orderToFactory.keySet())
                    .ne(ScanRecord::getScanType, "orchestration")
                    .eq(ScanRecord::getScanResult, "success")
                    .ge(ScanRecord::getScanTime, LocalDateTime.now().minusDays(30))
                    .list();
            Map<String, List<ScanRecord>> byFactory = new HashMap<>();
            for (ScanRecord r : scans) {
                String factory = orderToFactory.get(r.getOrderId());
                if (factory != null) {
                    byFactory.computeIfAbsent(factory, k -> new ArrayList<>()).add(r);
                }
            }
            for (Map.Entry<String, List<ScanRecord>> e : byFactory.entrySet()) {
                Set<String> operators = new HashSet<>();
                Set<LocalDate> activeDates = new HashSet<>();
                long totalQty = 0;
                for (ScanRecord r : e.getValue()) {
                    if (StringUtils.hasText(r.getOperatorId())) {
                        operators.add(r.getOperatorId());
                    }
                    if (r.getScanTime() != null) {
                        activeDates.add(r.getScanTime().toLocalDate());
                    }
                    totalQty += r.getQuantity() == null ? 0 : r.getQuantity();
                }
                workersByFactory.put(e.getKey(), operators.size());
                dailyOutputByFactory.put(e.getKey(),
                        activeDates.isEmpty() ? 0.0 : totalQty * 1.0 / activeDates.size());
            }
        } catch (Exception e) {
            log.warn("[StageHeatmap] 工厂人力统计失败（降级为无人力约束）: {}", e.getMessage());
        }
    }

    private Map<String, Double> loadStageMinutes(Long tenantId) {
        Map<String, Double> result = new HashMap<>();
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT stage_name, AVG(avg_minutes_per_unit) AS avg_minutes " +
                    "FROM t_intelligence_process_stats " +
                    "WHERE tenant_id = ? AND sample_count >= 2 AND avg_minutes_per_unit IS NOT NULL " +
                    "GROUP BY stage_name", tenantId);
            for (Map<String, Object> r : rows) {
                result.put(String.valueOf(r.get("stage_name")),
                        r.get("avg_minutes") == null ? null : Double.parseDouble(String.valueOf(r.get("avg_minutes"))));
            }
        } catch (Exception e) {
            log.warn("[StageHeatmap] 环节耗时统计读取失败（降级为全厂日均兜底）: {}", e.getMessage());
        }
        return result;
    }

    private String buildHint(String stage, long backlog, Double estDays, int workers) {
        if (estDays != null && estDays >= CRITICAL_DAYS) {
            return String.format("%s积压 %d 件，按当前 %d 人手约需 %.1f 天才能消化——建议优先补人/外发/调整排产", stage, backlog, workers, estDays);
        }
        if (estDays != null) {
            return String.format("%s积压 %d 件，约 %.1f 天可消化，关注即可", stage, backlog, estDays);
        }
        return String.format("%s积压 %d 件（暂无该环节耗时统计，无法折算天数）", stage, backlog);
    }

    private String buildSummary(List<Map<String, Object>> rows) {
        if (rows.isEmpty()) {
            return "各环节流转顺畅，没有明显积压";
        }
        Map<String, Object> worst = rows.get(0);
        long criticalCount = rows.stream().filter(r -> "CRITICAL".equals(r.get("level"))).count();
        return String.format("最大积压在「%s → %s」（%s 厂，%s 件），全厂共 %d 处黄区以上积压",
                worst.get("upstreamStage"), worst.get("stage"), worst.get("factoryName"),
                worst.get("backlogQty"), criticalCount);
    }
}
