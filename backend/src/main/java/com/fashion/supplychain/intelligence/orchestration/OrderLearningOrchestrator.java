package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.OrderDecisionSnapshot;
import com.fashion.supplychain.intelligence.entity.OrderFulfillmentOutcome;
import com.fashion.supplychain.intelligence.mapper.OrderDecisionSnapshotMapper;
import com.fashion.supplychain.intelligence.mapper.OrderFulfillmentOutcomeMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Slf4j
@Service
public class OrderLearningOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private OrderDecisionSnapshotMapper snapshotMapper;
    @Autowired private OrderFulfillmentOutcomeMapper outcomeMapper;

    public Long captureDecision(CaptureDecisionRequest request) {
        try {
            OrderDecisionSnapshot snapshot = new OrderDecisionSnapshot();
            snapshot.setTenantId(UserContext.tenantId());
            snapshot.setOrderNo(request.getOrderNo());
            snapshot.setStyleNo(request.getStyleNo());
            snapshot.setFactoryId(request.getFactoryId());
            snapshot.setDecisionType(request.getDecisionType());
            snapshot.setDecisionData(serialize(request.getDecisionData()));
            snapshot.setAiSuggestion(request.getAiSuggestion());
            snapshot.setAiConfidence(request.getAiConfidence());
            snapshot.setUserChoice(request.getUserChoice());
            snapshot.setUserModifiedFields(serialize(request.getUserModifiedFields()));
            snapshot.setCreatedBy(UserContext.username());
            snapshotMapper.insert(snapshot);
            log.info("[下单学习] 决策快照已捕获: orderNo={}, choice={}, aiConfidence={}",
                    request.getOrderNo(), request.getUserChoice(), request.getAiConfidence());
            return snapshot.getId();
        } catch (Exception e) {
            log.warn("[下单学习] 捕获决策快照失败: {}", e.getMessage());
            return null;
        }
    }

    public void recordOutcome(RecordOutcomeRequest request) {
        try {
            OrderFulfillmentOutcome outcome = new OrderFulfillmentOutcome();
            outcome.setTenantId(UserContext.tenantId());
            outcome.setOrderNo(request.getOrderNo());
            outcome.setSnapshotId(request.getSnapshotId());
            outcome.setActualDeliveryDate(request.getActualDeliveryDate());
            outcome.setPlannedDeliveryDate(request.getPlannedDeliveryDate());
            outcome.setDeliveryDelayDays(request.getDeliveryDelayDays());
            outcome.setActualCost(request.getActualCost());
            outcome.setEstimatedCost(request.getEstimatedCost());
            outcome.setCostVariance(request.getCostVariance());
            outcome.setQualityPassRate(request.getQualityPassRate());
            outcome.setCustomerSatisfaction(request.getCustomerSatisfaction());
            outcome.setOutcomeSummary(serialize(request.getOutcomeSummary()));
            outcomeMapper.insert(outcome);
            log.info("[下单学习] 履约结果已记录: orderNo={}, delayDays={}, costVariance={}",
                    request.getOrderNo(), request.getDeliveryDelayDays(), request.getCostVariance());
        } catch (Exception e) {
            log.warn("[下单学习] 记录履约结果失败: {}", e.getMessage());
        }
    }

    public Map<String, Object> getHistoricalInsight(String styleNo, String factoryId) {
        Map<String, Object> insight = new LinkedHashMap<>();
        try {
            Long tenantId = UserContext.tenantId();
            LambdaQueryWrapper<OrderFulfillmentOutcome> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(OrderFulfillmentOutcome::getTenantId, tenantId);
            wrapper.orderByDesc(OrderFulfillmentOutcome::getRecordedAt);
            wrapper.last("LIMIT 20");
            List<OrderFulfillmentOutcome> recentOutcomes = outcomeMapper.selectList(wrapper);

            if (recentOutcomes.isEmpty()) {
                insight.put("hasData", false);
                insight.put("message", "暂无历史履约数据，无法生成洞察");
                return insight;
            }

            double avgDelay = recentOutcomes.stream()
                    .filter(o -> o.getDeliveryDelayDays() != null)
                    .mapToInt(OrderFulfillmentOutcome::getDeliveryDelayDays)
                    .average().orElse(0.0);

            long onTimeCount = recentOutcomes.stream()
                    .filter(o -> o.getDeliveryDelayDays() != null && o.getDeliveryDelayDays() <= 0)
                    .count();

            double avgCostVariance = recentOutcomes.stream()
                    .filter(o -> o.getCostVariance() != null)
                    .mapToDouble(o -> o.getCostVariance().doubleValue())
                    .average().orElse(0.0);

            double avgQuality = recentOutcomes.stream()
                    .filter(o -> o.getQualityPassRate() != null)
                    .mapToDouble(o -> o.getQualityPassRate().doubleValue())
                    .average().orElse(0.0);

            insight.put("hasData", true);
            insight.put("sampleSize", recentOutcomes.size());
            insight.put("avgDeliveryDelayDays", Math.round(avgDelay * 10.0) / 10.0);
            insight.put("onTimeRate", Math.round((double) onTimeCount / recentOutcomes.size() * 1000.0) / 10.0 + "%");
            insight.put("avgCostVariance", Math.round(avgCostVariance * 100.0) / 100.0);
            insight.put("avgQualityPassRate", Math.round(avgQuality * 10.0) / 10.0 + "%");
            insight.put("recommendation", generateRecommendation(avgDelay, avgCostVariance, avgQuality));
        } catch (Exception e) {
            log.warn("[下单学习] 获取历史洞察失败: {}", e.getMessage());
            insight.put("hasData", false);
            insight.put("error", e.getMessage());
        }
        return insight;
    }

    public Map<String, Object> getAdoptionStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        try {
            Long tenantId = UserContext.tenantId();
            LambdaQueryWrapper<OrderDecisionSnapshot> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(OrderDecisionSnapshot::getTenantId, tenantId);
            wrapper.ge(OrderDecisionSnapshot::getCreateTime, LocalDateTime.now().minusDays(30));
            List<OrderDecisionSnapshot> snapshots = snapshotMapper.selectList(wrapper);

            long total = snapshots.size();
            long adopted = snapshots.stream().filter(s -> "adopted".equals(s.getUserChoice())).count();
            long modified = snapshots.stream().filter(s -> "modified".equals(s.getUserChoice())).count();
            long rejected = snapshots.stream().filter(s -> "rejected".equals(s.getUserChoice())).count();

            stats.put("total", total);
            stats.put("adopted", adopted);
            stats.put("modified", modified);
            stats.put("rejected", rejected);
            stats.put("adoptionRate", total > 0 ? Math.round((double) adopted / total * 1000.0) / 10.0 + "%" : "N/A");
        } catch (Exception e) {
            log.warn("[下单学习] 获取采纳统计失败: {}", e.getMessage());
        }
        return stats;
    }

    private String generateRecommendation(double avgDelay, double avgCostVariance, double avgQuality) {
        StringBuilder sb = new StringBuilder();
        if (avgDelay > 3) {
            sb.append("历史平均延期").append(Math.round(avgDelay)).append("天，建议预留缓冲期；");
        } else if (avgDelay <= 0) {
            sb.append("历史准时交付率良好；");
        }
        if (avgCostVariance > 500) {
            sb.append("成本偏差较大，建议复核报价；");
        }
        if (avgQuality < 90) {
            sb.append("质量合格率偏低，建议加强质检。");
        } else {
            sb.append("质量合格率良好。");
        }
        return sb.toString();
    }

    private String serialize(Object data) {
        if (data == null) return null;
        try {
            return MAPPER.writeValueAsString(data);
        } catch (Exception e) {
            return String.valueOf(data);
        }
    }

    @Data
    public static class CaptureDecisionRequest {
        private String orderNo;
        private String styleNo;
        private Long factoryId;
        private String decisionType;
        private Object decisionData;
        private String aiSuggestion;
        private BigDecimal aiConfidence;
        private String userChoice;
        private Object userModifiedFields;
    }

    @Data
    public static class RecordOutcomeRequest {
        private String orderNo;
        private Long snapshotId;
        private java.time.LocalDate actualDeliveryDate;
        private java.time.LocalDate plannedDeliveryDate;
        private Integer deliveryDelayDays;
        private BigDecimal actualCost;
        private BigDecimal estimatedCost;
        private BigDecimal costVariance;
        private BigDecimal qualityPassRate;
        private String customerSatisfaction;
        private Object outcomeSummary;
    }
}
