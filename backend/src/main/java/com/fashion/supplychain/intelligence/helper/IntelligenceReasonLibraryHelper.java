package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.TenantPreferenceProfile;
import com.fashion.supplychain.production.entity.ProductionOrder;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

/**
 * 智能分析「理由文案库」。
 *
 * <p>D-658：原 {@code IntelligenceReasonLibraryService}（位于 {@code intelligence.service} 包）。
 * 它的 4 个方法（buildOrderRiskReason / buildFactoryRiskReason / buildScanAnomalyReason /
 * buildProfitPressureReason）全部是<b>无状态纯函数</b>（输入参数 → 输出中文文案，无实例状态、
 * 无依赖注入），本质是文案库而非业务 Service。原名导致
 * {@code TenantIntelligencePreferenceService} 因注入它而被判「Service 依赖 Service」违规。
 *
 * <p>现更名为 {@code *Helper} 并移入 {@code intelligence.helper} 包（与 D-653 的命名修正一致）。
 * <b>逻辑零改动</b>。后续可进一步静态化为纯工具类（参照 {@code PromptToolLabelMapper}）。
 */
@Service
@Lazy
public class IntelligenceReasonLibraryHelper {

    public String buildOrderRiskReason(ProductionOrder order, TenantPreferenceProfile tenantProfile) {
        List<String> reasons = new ArrayList<>();
        if ("delayed".equalsIgnoreCase(order.getStatus())) {
            reasons.add("订单状态已延期");
        }
        int progress = safeInt(order.getProductionProgress());
        if (progress < 50) {
            reasons.add("生产进度偏低");
        }
        if (order.getPlannedEndDate() != null) {
            long diffDays = ChronoUnit.DAYS.between(LocalDate.now(), order.getPlannedEndDate().toLocalDate());
            int warningDays = tenantProfile != null && tenantProfile.getDeliveryWarningDays() != null
                    ? tenantProfile.getDeliveryWarningDays()
                    : 3;
            if (diffDays < 0) {
                reasons.add("计划完成日已超期");
            } else if (diffDays <= warningDays) {
                reasons.add("已进入该租户的交期预警窗口");
            }
        }
        return reasons.isEmpty() ? "需关注生产推进" : String.join("，", reasons);
    }

    public String buildFactoryRiskReason(String factoryName, double delayedRate, int avgProgress, double lowMarginRate) {
        List<String> reasons = new ArrayList<>();
        if (delayedRate >= 0.3D) {
            reasons.add("延期占比偏高");
        }
        if (avgProgress < 50) {
            reasons.add("平均进度落后");
        }
        if (lowMarginRate >= 0.4D) {
            reasons.add("低毛利订单占比较高");
        }
        if (reasons.isEmpty()) {
            reasons.add("近期执行稳定性弱于其他工厂");
        }
        return factoryName + " 的主要风险来自" + String.join("、", reasons);
    }

    public String buildScanAnomalyReason(String stageName, String processName, int anomalyCount, Integer threshold) {
        int currentThreshold = threshold == null ? 5 : threshold;
        String position = (stageName == null || stageName.isBlank() ? "" : stageName + " / ")
                + (processName == null || processName.isBlank() ? "未知工序" : processName);
        if (anomalyCount >= currentThreshold) {
            return position + " 已达到该租户的异常预警阈值，说明问题在这里重复发生。";
        }
        return position + " 已出现异常，但还没有超过该租户的集中预警阈值。";
    }

    public String buildProfitPressureReason(String source, BigDecimal amount, BigDecimal grossMargin, BigDecimal threshold) {
        String sourceLabel = switch (source == null ? "" : source) {
            case "PROCESS" -> "工序成本";
            case "MATERIAL" -> "物料成本";
            case "OTHER" -> "其他成本";
            default -> "成本";
        };
        String amountText = amount == null ? "0.00" : amount.setScale(2, RoundingMode.HALF_UP).toPlainString();
        String thresholdText = threshold == null ? "5.00" : threshold.setScale(2, RoundingMode.HALF_UP).toPlainString();
        if (grossMargin != null && threshold != null && grossMargin.compareTo(threshold) < 0) {
            return sourceLabel + "当前占压约 " + amountText + "，已低于该租户常用利润安全线 " + thresholdText + "% 。";
        }
        return sourceLabel + "当前占压约 " + amountText + "，这是目前最主要的利润挤压来源。";
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : value;
    }
}
