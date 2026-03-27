package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.OrderDecisionSnapshot;
import com.fashion.supplychain.intelligence.entity.OrderLearningOutcome;
import com.fashion.supplychain.intelligence.service.OrderDecisionSnapshotService;
import com.fashion.supplychain.intelligence.service.OrderLearningOutcomeService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderLearningOutcomeOrchestrator {

    private final ProductionOrderService productionOrderService;
    private final OrderDecisionSnapshotService orderDecisionSnapshotService;
    private final OrderLearningOutcomeService orderLearningOutcomeService;
    private final ObjectMapper objectMapper;

    public void refreshByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return;
        }
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            return;
        }
        try {
            OrderDecisionSnapshot snapshot = orderDecisionSnapshotService.getOne(
                    new LambdaQueryWrapper<OrderDecisionSnapshot>()
                            .eq(OrderDecisionSnapshot::getTenantId, UserContext.tenantId())
                            .eq(OrderDecisionSnapshot::getOrderId, orderId)
                            .last("limit 1"),
                    false
            );
            OrderLearningOutcome outcome = orderLearningOutcomeService.getOne(
                    new LambdaQueryWrapper<OrderLearningOutcome>()
                            .eq(OrderLearningOutcome::getTenantId, UserContext.tenantId())
                            .eq(OrderLearningOutcome::getOrderId, orderId)
                            .last("limit 1"),
                    false
            );
            if (outcome == null) {
                outcome = new OrderLearningOutcome();
                outcome.setCreateTime(LocalDateTime.now());
            }
            BigDecimal estimatedUnitCost = snapshot == null ? readPricingDecimal(order.getOrderDetails(), "totalCostUnitPrice") : snapshot.getTotalCostUnitPrice();
            BigDecimal actualUnitCost = order.getFactoryUnitPrice();
            Integer delayDays = calcDelayDays(order.getPlannedEndDate(), order.getActualEndDate());

            outcome.setTenantId(UserContext.tenantId());
            outcome.setOrderId(order.getId());
            outcome.setOrderNo(order.getOrderNo());
            outcome.setDecisionSnapshotId(snapshot == null ? null : snapshot.getId());
            outcome.setActualFactoryId(order.getFactoryId());
            outcome.setActualFactoryName(order.getFactoryName());
            outcome.setPlannedFinishDate(order.getPlannedEndDate());
            outcome.setActualFinishDate(order.getActualEndDate());
            outcome.setDelayDays(delayDays);
            outcome.setEstimatedUnitCost(estimatedUnitCost);
            outcome.setActualUnitCost(actualUnitCost);
            outcome.setEstimatedTotalCost(multiply(estimatedUnitCost, order.getOrderQuantity()));
            outcome.setActualTotalCost(multiply(actualUnitCost, order.getOrderQuantity()));
            outcome.setActualScatterExtraCost(snapshot == null ? BigDecimal.ZERO : multiply(snapshot.getScatterExtraPerPiece(), order.getOrderQuantity()));
            outcome.setCostDeviationRate(calcDeviationRate(outcome.getEstimatedTotalCost(), outcome.getActualTotalCost()));
            outcome.setOutcomeScore(buildOutcomeScore(delayDays, outcome.getCostDeviationRate()));
            outcome.setOutcomeSummary(buildOutcomeSummary(delayDays, outcome.getCostDeviationRate()));
            outcome.setUpdateTime(LocalDateTime.now());
            orderLearningOutcomeService.saveOrUpdate(outcome);
        } catch (Exception ex) {
            log.warn("refresh order learning outcome failed, orderId={}", orderId, ex);
        }
    }

    private BigDecimal readPricingDecimal(String orderDetails, String field) {
        try {
            JsonNode root = objectMapper.readTree(StringUtils.hasText(orderDetails) ? orderDetails : "{}");
            JsonNode pricing = root.path("pricing").path(field);
            if (pricing.isMissingNode() || pricing.isNull()) {
                return null;
            }
            return new BigDecimal(pricing.asText("0"));
        } catch (Exception ex) {
            return null;
        }
    }

    private Integer calcDelayDays(LocalDateTime plannedFinishDate, LocalDateTime actualFinishDate) {
        if (plannedFinishDate == null || actualFinishDate == null) {
            return 0;
        }
        long days = ChronoUnit.DAYS.between(plannedFinishDate.toLocalDate(), actualFinishDate.toLocalDate());
        return (int) Math.max(days, 0);
    }

    private BigDecimal multiply(BigDecimal unitPrice, Integer qty) {
        if (unitPrice == null || qty == null) {
            return null;
        }
        return unitPrice.multiply(BigDecimal.valueOf(qty));
    }

    private BigDecimal calcDeviationRate(BigDecimal expected, BigDecimal actual) {
        if (expected == null || actual == null || expected.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        return actual.subtract(expected)
                .divide(expected, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));
    }

    private BigDecimal buildOutcomeScore(Integer delayDays, BigDecimal deviationRate) {
        BigDecimal score = BigDecimal.valueOf(100);
        if (delayDays != null && delayDays > 0) {
            score = score.subtract(BigDecimal.valueOf(Math.min(delayDays * 3L, 30L)));
        }
        if (deviationRate != null && deviationRate.compareTo(BigDecimal.ZERO) > 0) {
            score = score.subtract(deviationRate.min(BigDecimal.valueOf(30)));
        }
        return score.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    private String buildOutcomeSummary(Integer delayDays, BigDecimal deviationRate) {
        if (delayDays != null && delayDays > 0) {
            return "本单实际延期 " + delayDays + " 天";
        }
        if (deviationRate != null && deviationRate.compareTo(BigDecimal.ZERO) > 0) {
            return "本单实际成本高于预估 " + deviationRate.setScale(1, RoundingMode.HALF_UP) + "%";
        }
        return "本单当前履约结果平稳";
    }
}
