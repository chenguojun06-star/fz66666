package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 交期偏差回扫自校准编排器（D-754 P3）。
 *
 * <p>回答「我的交期建议准不准？」——每天回扫近 180 天已完工订单，
 * 按 工厂 / 品类 / 工厂×品类 三个维度统计：
 * <ul>
 *   <li>准交率 = 实际完工 ≤ 承诺交期 的比例</li>
 *   <li>平均偏差天数 = 实际完工 − 承诺交期（正=延期）</li>
 *   <li>偏差倍数 = 实际生产周期 ÷ 计划允许周期</li>
 *   <li>平均实际生产周期</li>
 * </ul>
 * 结果持久化到 {@code t_delivery_calibration_stat}，供
 * {@link DeliveryDateSuggestionOrchestrator} 反哺修正缓冲天数，实现「越用越准」。
 */
@Slf4j
@Service
public class DeliveryCalibrationOrchestrator {

    private static final String DIM_FACTORY = "FACTORY";
    private static final String DIM_CATEGORY = "CATEGORY";
    private static final String DIM_FACTORY_CATEGORY = "FACTORY_CATEGORY";

    /** 回扫窗口（天） */
    private static final int LOOKBACK_DAYS = 180;
    /** 生效所需最小样本数 */
    public static final int MIN_SAMPLE = 2;
    /** 偏差倍数上下限（防止极端值污染建议） */
    private static final double MIN_MULTIPLE = 0.5;
    private static final double MAX_MULTIPLE = 2.5;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 单维度校准结果 */
    @Data
    public static class DeliveryCalibration {
        private String dimensionType;
        private String dimensionKey;
        private int sampleCount;
        private int onTimeCount;
        /** 准交率（%），-1 表示无数据 */
        private double onTimeRate = -1;
        private double avgDeviationDays;
        private double deviationMultiple = 1.0;
        private double avgLeadDays;
        private LocalDateTime lastCalcTime;
    }

    /**
     * 回扫并重新校准当前租户的全部维度，返回执行摘要。
     */
    public Map<String, Object> calibrate() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Map<String, Object> resp = new LinkedHashMap<>();

        List<ProductionOrder> orders = loadCompletedOrders(tenantId);
        if (orders.isEmpty()) {
            resp.put("summary", "近 " + LOOKBACK_DAYS + " 天暂无已完工订单，无法校准");
            resp.put("orderCount", 0);
            resp.put("dimensionCount", 0);
            resp.put("rows", List.of());
            return resp;
        }

        Map<String, Acc> accs = new HashMap<>();
        for (ProductionOrder o : orders) {
            accumulate(accs, o);
        }

        int written = 0;
        for (Map.Entry<String, Acc> e : accs.entrySet()) {
            Acc acc = e.getValue();
            if (acc.sampleCount < 1) {
                continue;
            }
            int splitAt = e.getKey().indexOf('|');
            String dimType = e.getKey().substring(0, splitAt);
            String dimKey = e.getKey().substring(splitAt + 1);
            if (StringUtils.hasText(dimKey)) {
                upsert(tenantId, dimType, dimKey, acc);
                written++;
            }
        }

        List<Map<String, Object>> rows = listAll();
        resp.put("orderCount", orders.size());
        resp.put("dimensionCount", written);
        resp.put("rows", rows);
        resp.put("summary", String.format("回扫 %d 单已完工订单，校准 %d 个维度",
                orders.size(), written));

        log.info("[交期校准] 租户{} 回扫{}单 → 校准{}维度", tenantId, orders.size(), written);
        return resp;
    }

    /**
     * 读取某工厂（可带品类）的校准结果，供交期建议器反哺使用。
     * 优先 工厂×品类，其次 工厂，最后 品类；样本不足返回 null。
     *
     * @param factoryName  工厂名（可空）
     * @param productCategory 品类（可空）
     */
    public DeliveryCalibration lookup(String factoryName, String productCategory) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (StringUtils.hasText(factoryName) && StringUtils.hasText(productCategory)) {
            DeliveryCalibration c = queryOne(tenantId, DIM_FACTORY_CATEGORY,
                    factoryName + "|" + productCategory);
            if (c != null && c.getSampleCount() >= MIN_SAMPLE) {
                return c;
            }
        }
        if (StringUtils.hasText(factoryName)) {
            DeliveryCalibration c = queryOne(tenantId, DIM_FACTORY, factoryName);
            if (c != null && c.getSampleCount() >= MIN_SAMPLE) {
                return c;
            }
        }
        if (StringUtils.hasText(productCategory)) {
            DeliveryCalibration c = queryOne(tenantId, DIM_CATEGORY, productCategory);
            if (c != null && c.getSampleCount() >= MIN_SAMPLE) {
                return c;
            }
        }
        return null;
    }

    /** 当前租户全部校准行（供看板查询） */
    public List<Map<String, Object>> listAll() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            return jdbcTemplate.queryForList(
                    "SELECT dimension_type, dimension_key, sample_count, on_time_count, on_time_rate, "
                            + "avg_deviation_days, deviation_multiple, avg_lead_days, last_calc_time "
                            + "FROM t_delivery_calibration_stat WHERE tenant_id = ? "
                            + "ORDER BY dimension_type, sample_count DESC", tenantId);
        } catch (Exception e) {
            log.warn("[交期校准] 查询失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    // ────────────────────────────────────────────────────────────────

    private List<ProductionOrder> loadCompletedOrders(Long tenantId) {
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getStatus, "completed")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .isNotNull(ProductionOrder::getActualEndDate)
                .ge(ProductionOrder::getActualEndDate, LocalDateTime.now().minusDays(LOOKBACK_DAYS))
                .list();
    }

    private void accumulate(Map<String, Acc> accs, ProductionOrder o) {
        LocalDateTime plannedEnd = o.getPlannedEndDate();
        LocalDateTime actualEnd = o.getActualEndDate();
        if (plannedEnd == null || actualEnd == null) {
            return;
        }

        LocalDate anchor = o.getActualStartDate() != null
                ? o.getActualStartDate().toLocalDate()
                : (o.getCreateTime() != null ? o.getCreateTime().toLocalDate() : null);

        long deviation = ChronoUnit.DAYS.between(plannedEnd.toLocalDate(), actualEnd.toLocalDate());
        boolean onTime = !actualEnd.isAfter(plannedEnd);

        Double leadDays = null;
        if (anchor != null) {
            leadDays = (double) ChronoUnit.DAYS.between(anchor, actualEnd.toLocalDate());
        }
        Double multiple = null;
        if (anchor != null && leadDays != null && leadDays > 0) {
            long plannedDuration = ChronoUnit.DAYS.between(anchor, plannedEnd.toLocalDate());
            if (plannedDuration > 0) {
                multiple = leadDays / plannedDuration;
            }
        }

        String factory = StringUtils.hasText(o.getFactoryName()) ? o.getFactoryName().trim() : null;
        String category = StringUtils.hasText(o.getProductCategory()) ? o.getProductCategory().trim() : null;

        if (factory != null) {
            get(accs, DIM_FACTORY, factory).add(deviation, onTime, leadDays, multiple);
        }
        if (category != null) {
            get(accs, DIM_CATEGORY, category).add(deviation, onTime, leadDays, multiple);
        }
        if (factory != null && category != null) {
            get(accs, DIM_FACTORY_CATEGORY, factory + "|" + category)
                    .add(deviation, onTime, leadDays, multiple);
        }
    }

    private Acc get(Map<String, Acc> accs, String dimType, String dimKey) {
        return accs.computeIfAbsent(dimType + "|" + dimKey, k -> new Acc());
    }

    private void upsert(Long tenantId, String dimType, String dimKey, Acc acc) {
        String key = dimKey.length() > 255 ? dimKey.substring(0, 255) : dimKey;
        double onTimeRate = round2(acc.onTimeCount * 100.0 / acc.sampleCount);
        double avgDeviation = round2(acc.sumDeviation / acc.sampleCount);
        Double multiple = acc.multipleCount > 0
                ? round3(acc.sumMultiple / acc.multipleCount) : null;
        Double avgLead = acc.leadCount > 0
                ? round2(acc.sumLead / acc.leadCount) : null;

        jdbcTemplate.update(
                "INSERT INTO t_delivery_calibration_stat "
                        + "(tenant_id, dimension_type, dimension_key, sample_count, on_time_count, on_time_rate, "
                        + "avg_deviation_days, deviation_multiple, avg_lead_days, last_calc_time) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,NOW()) "
                        + "ON DUPLICATE KEY UPDATE sample_count=VALUES(sample_count), "
                        + "on_time_count=VALUES(on_time_count), on_time_rate=VALUES(on_time_rate), "
                        + "avg_deviation_days=VALUES(avg_deviation_days), "
                        + "deviation_multiple=VALUES(deviation_multiple), "
                        + "avg_lead_days=VALUES(avg_lead_days), last_calc_time=NOW()",
                tenantId, dimType, key, acc.sampleCount, acc.onTimeCount,
                BigDecimal.valueOf(onTimeRate), BigDecimal.valueOf(avgDeviation),
                multiple == null ? null : BigDecimal.valueOf(multiple),
                avgLead == null ? null : BigDecimal.valueOf(avgLead));
    }

    private DeliveryCalibration queryOne(Long tenantId, String dimType, String dimKey) {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT dimension_type, dimension_key, sample_count, on_time_count, on_time_rate, "
                            + "avg_deviation_days, deviation_multiple, avg_lead_days, last_calc_time "
                            + "FROM t_delivery_calibration_stat "
                            + "WHERE tenant_id = ? AND dimension_type = ? AND dimension_key = ? LIMIT 1",
                    tenantId, dimType, dimKey);
            if (rows.isEmpty()) {
                return null;
            }
            Map<String, Object> r = rows.get(0);
            DeliveryCalibration c = new DeliveryCalibration();
            c.setDimensionType(dimType);
            c.setDimensionKey(dimKey);
            c.setSampleCount(toInt(r.get("sample_count")));
            c.setOnTimeCount(toInt(r.get("on_time_count")));
            c.setOnTimeRate(toDouble(r.get("on_time_rate"), -1));
            c.setAvgDeviationDays(toDouble(r.get("avg_deviation_days"), 0));
            c.setDeviationMultiple(clamp(toDouble(r.get("deviation_multiple"), 1.0)));
            c.setAvgLeadDays(toDouble(r.get("avg_lead_days"), 0));
            return c;
        } catch (Exception e) {
            log.warn("[交期校准] 读取维度[{}|{}]失败: {}", dimType, dimKey, e.getMessage());
            return null;
        }
    }

    private double clamp(double multiple) {
        if (multiple <= 0) {
            return 1.0;
        }
        return Math.max(MIN_MULTIPLE, Math.min(MAX_MULTIPLE, multiple));
    }

    private static int toInt(Object v) {
        return v == null ? 0 : (int) Math.round(Double.parseDouble(String.valueOf(v)));
    }

    private static double toDouble(Object v, double fallback) {
        if (v == null) {
            return fallback;
        }
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static double round2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private static double round3(double v) {
        return BigDecimal.valueOf(v).setScale(3, RoundingMode.HALF_UP).doubleValue();
    }

    /** 维度累加器 */
    private static class Acc {
        private int sampleCount;
        private int onTimeCount;
        private double sumDeviation;
        private double sumLead;
        private int leadCount;
        private double sumMultiple;
        private int multipleCount;

        void add(long deviation, boolean onTime, Double leadDays, Double multiple) {
            sampleCount++;
            if (onTime) {
                onTimeCount++;
            }
            sumDeviation += deviation;
            if (leadDays != null) {
                sumLead += leadDays;
                leadCount++;
            }
            if (multiple != null) {
                sumMultiple += multiple;
                multipleCount++;
            }
        }
    }
}