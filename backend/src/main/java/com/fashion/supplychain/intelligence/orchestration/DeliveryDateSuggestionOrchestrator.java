package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.DeliveryDateSuggestionResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.FactoryCapacityOrchestrator;
import com.fashion.supplychain.production.orchestration.FactoryCapacityOrchestrator.FactoryCapacityItem;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.OptionalDouble;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 交货期智能建议编排器
 * <p>
 * 基于工厂日均产量 + 当前在制负荷 + 历史交货表现，
 * 为新建订单推荐合理的交货天数区间。
 * <pre>
 *   baseDays = ceil(orderQty / avgDailyOutput)
 *   load补偿 = ceil(inProgressQty / avgDailyOutput * 0.2) — 并行在制积压
 *   recommended = baseDays + loadDays + bufferDays(5)
 *   earliest   = max(7, baseDays + 2)
 *   latest     = recommended * 1.4
 * </pre>
 */
@Service
@Slf4j
public class DeliveryDateSuggestionOrchestrator {

    /** 固定缓冲天数（质检/物流/突发） */
    private static final int BUFFER_DAYS = 5;
    /** 最少建议天数 */
    private static final int MIN_DAYS = 7;

    @Autowired
    private FactoryCapacityOrchestrator factoryCapacityOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    public DeliveryDateSuggestionResponse suggest(String factoryName, Integer orderQuantity) {
        DeliveryDateSuggestionResponse resp = new DeliveryDateSuggestionResponse();

        int qty = (orderQuantity != null && orderQuantity > 0) ? orderQuantity : 100;

        // ── 1. 获取工厂产能数据 ──────────────────────────────────────────────
        FactoryCapacityItem stat = null;
        if (StringUtils.hasText(factoryName)) {
            try {
                List<FactoryCapacityItem> items = factoryCapacityOrchestrator.getFactoryCapacity();
                stat = items.stream()
                        .filter(i -> factoryName.equals(i.getFactoryName()))
                        .findFirst().orElse(null);
            } catch (Exception e) {
                log.warn("[交货建议] 获取产能数据失败: {}", e.getMessage());
            }
        }

        // ── 2. 计算建议天数 ──────────────────────────────────────────────────
        if (stat != null && stat.getAvgDailyOutput() > 0) {
            double velocity = stat.getAvgDailyOutput();
            int baseDays   = (int) Math.ceil(qty / velocity);
            int loadDays   = (int) Math.ceil(stat.getTotalQuantity() / velocity * 0.2);
            int recommended = Math.max(MIN_DAYS, baseDays + loadDays + BUFFER_DAYS);
            int earliest   = Math.max(MIN_DAYS, baseDays + 2);
            int latest     = (int) Math.ceil(recommended * 1.4);

            resp.setEarliestDays(earliest);
            resp.setRecommendedDays(recommended);
            resp.setLatestDays(latest);
            resp.setFactoryAvgDailyOutput(velocity);
            resp.setFactoryInProgressOrders(stat.getTotalOrders());
            resp.setFactoryInProgressQty(stat.getTotalQuantity());
            resp.setFactoryOnTimeRate(stat.getDeliveryOnTimeRate());
            resp.setConfidence(0.75);

            String loadNote = loadDays > 0
                    ? String.format("；当前在制 %d 件（约 %d 天积压），增加 %d 天缓冲",
                            stat.getTotalQuantity(), (int) Math.ceil(stat.getTotalQuantity() / velocity), loadDays)
                    : "；当前负荷较空";
            resp.setReason(String.format(
                    "%s 日均产量约 %.0f 件，生产 %d 件预计需 %d 天%s，加质检缓冲 %d 天，建议交货期 %d 天",
                    factoryName, velocity, qty, baseDays, loadNote, BUFFER_DAYS, recommended));
            resp.setAlgorithm("产能预测（avgDailyOutput驱动）");

        } else {
            // 降级：历史交货周期均值
            resp = buildFallback(factoryName, qty);
        }
        return resp;
    }

    /** 无产能数据时降级到历史订单平均周期 */
    private DeliveryDateSuggestionResponse buildFallback(String factoryName, int qty) {
        DeliveryDateSuggestionResponse resp = new DeliveryDateSuggestionResponse();
        int recommended = 21; // 经验默认21天

        try {
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<ProductionOrder>()
                    .eq("tenant_id", tenantId)
                    .eq("status", "completed")
                    .eq("delete_flag", 0)
                    .isNotNull("planned_end_date")
                    .isNotNull("actual_end_date");
            if (StringUtils.hasText(factoryName)) {
                qw.eq("factory_name", factoryName);
            }
            qw.orderByDesc("create_time").last("LIMIT 30");

            List<ProductionOrder> history = productionOrderService.list(qw);
            OptionalDouble avg = history.stream()
                    .filter(o -> o.getPlannedEndDate() != null && o.getActualEndDate() != null)
                    .mapToLong(o -> ChronoUnit.DAYS.between(
                            o.getActualEndDate().toLocalDate().minusDays(
                                    (o.getOrderQuantity() != null && o.getOrderQuantity() > 0)
                                            ? (long) Math.ceil(o.getOrderQuantity() / 80.0)
                                            : 14),
                            o.getActualEndDate().toLocalDate()))
                    .filter(d -> d > 0 && d < 120)
                    .average();
            if (avg.isPresent()) {
                recommended = (int) Math.ceil(avg.getAsDouble());
            }
        } catch (Exception e) {
            log.debug("[交货建议降级] {}", e.getMessage());
        }

        recommended = Math.max(MIN_DAYS, recommended);
        resp.setEarliestDays(Math.max(MIN_DAYS, recommended - 5));
        resp.setRecommendedDays(recommended);
        resp.setLatestDays((int) Math.ceil(recommended * 1.4));
        resp.setFactoryAvgDailyOutput(0);
        resp.setFactoryOnTimeRate(-1);
        resp.setConfidence(0.40);
        resp.setReason(StringUtils.hasText(factoryName)
                ? factoryName + " 暂无扫码产量数据，基于历史订单周期估算，建议交货期约 " + recommended + " 天"
                : "基于历史订单均值估算，建议交货期约 " + recommended + " 天");
        resp.setAlgorithm("历史均值降级");
        return resp;
    }

}
