package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * D-754：物料采购价异动监控（真数据版，取代已删除的 Math.random 假价格预警）。
 *
 * <p>逻辑：对每个物料，比较「近 30 天采购均价」与「此前 90 天采购均价」，
 * 偏差超过 15% 时建 PRICE_WATCH 工单——数字全部来自自家 t_material_purchase
 * 成交价，不是外部行情；涨跌即供应商实际报价变化，直接可行动（换源/议价/锁价）。</p>
 */
@Slf4j
@Component
public class MaterialPriceWatchJob extends AbstractPatrolJob {

    private static final double DEVIATION_THRESHOLD = 0.15;
    private static final int MIN_SAMPLES_PER_WINDOW = 3;

    @Scheduled(cron = "0 10 3 * * ?")
    public void patrol() {
        log.info("[PriceWatch] ===== 物料价格异动监控开始 =====");
        var tenants = getActiveTenantIds();
        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "price-watch",
                        "价格监控：物料采购价异动扫描");
                long s1 = System.currentTimeMillis();

                List<Map<String, Object>> alerts = scanPriceDeviations(tenantId);
                if (!alerts.isEmpty() && isPatrolEnabledForTenant(tenantId)) {
                    for (Map<String, Object> alert : alerts) {
                        String materialCode = String.valueOf(alert.get("material_code"));
                        String summary = String.valueOf(alert.get("summary"));
                        final String issue = String.format("价格监控：%s", summary);
                        String payload = String.format(
                                "{\"action\":\"price_watch\",\"materialCode\":\"%s\",\"recentAvg\":%s,\"priorAvg\":%s,\"deviationPct\":%s}",
                                materialCode, alert.get("recent_avg"), alert.get("prior_avg"), alert.get("deviation_pct"));
                        withTenantContext(tenantId, () -> patrolOrchestrator.createAction(
                                "MATERIAL_PRICE_WATCH_JOB", issue, "PRICE_WATCH",
                                "MEDIUM", "material", materialCode, payload,
                                BigDecimal.valueOf(0.9), "NEED_APPROVAL"));
                    }
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "material_price_watch",
                        String.format("价格异动扫描完成，发现 %d 个物料异动", alerts.size()),
                        System.currentTimeMillis() - s1, true);
                finishAndSnapshot(tenantId, commandId, "price-watch", "价格监控",
                        String.format("物料价格异动监控完成，发现 %d 个异动", alerts.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[PriceWatch] 租户{} 扫描异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "扫描异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[PriceWatch] ===== 物料价格异动监控完成 =====");
    }

    /** 近30天均价 vs 此前90天均价，偏差超阈值且两边样本都够的材料 */
    private List<Map<String, Object>> scanPriceDeviations(Long tenantId) {
        try {
            // 一条 SQL 分窗口聚合：排除 0/NULL 单价，两个窗口各至少 3 笔
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT material_code, " +
                    "  AVG(CASE WHEN create_time >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN unit_price END) AS recent_avg, " +
                    "  COUNT(CASE WHEN create_time >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) AS recent_cnt, " +
                    "  AVG(CASE WHEN create_time < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN unit_price END) AS prior_avg, " +
                    "  COUNT(CASE WHEN create_time < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) AS prior_cnt " +
                    "FROM t_material_purchase " +
                    "WHERE tenant_id = ? AND delete_flag = 0 AND unit_price IS NOT NULL AND unit_price > 0 " +
                    "  AND create_time >= DATE_SUB(NOW(), INTERVAL 120 DAY) " +
                    "GROUP BY material_code " +
                    "HAVING recent_cnt >= ? AND prior_cnt >= ?",
                    tenantId, MIN_SAMPLES_PER_WINDOW, MIN_SAMPLES_PER_WINDOW);

            return rows.stream()
                    .filter(r -> {
                        BigDecimal recent = toDecimal(r.get("recent_avg"));
                        BigDecimal prior = toDecimal(r.get("prior_avg"));
                        if (recent == null || prior == null || prior.compareTo(BigDecimal.ZERO) == 0) {
                            return false;
                        }
                        return recent.subtract(prior).abs()
                                .divide(prior, 4, RoundingMode.HALF_UP)
                                .doubleValue() > DEVIATION_THRESHOLD;
                    })
                    .peek(r -> {
                        BigDecimal recent = toDecimal(r.get("recent_avg"));
                        BigDecimal prior = toDecimal(r.get("prior_avg"));
                        double pct = recent.subtract(prior)
                                .divide(prior, 4, RoundingMode.HALF_UP)
                                .doubleValue() * 100;
                        r.put("deviation_pct", String.format("%.1f", pct));
                        r.put("recent_avg", recent.setScale(2, RoundingMode.HALF_UP));
                        r.put("prior_avg", prior.setScale(2, RoundingMode.HALF_UP));
                        r.put("summary", String.format("物料 %s 采购均价异动：%s 元（近30天）vs %s 元（此前90天），偏离 %.1f%%，建议核实供应商报价或比价换源",
                                r.get("material_code"), r.get("recent_avg"), r.get("prior_avg"), pct));
                    })
                    .limit(10)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[PriceWatch] 租户{} 价格聚合查询失败: {}", tenantId, e.getMessage());
            return List.of();
        }
    }

    private BigDecimal toDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal bd) return bd;
        try {
            return new BigDecimal(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }
}
