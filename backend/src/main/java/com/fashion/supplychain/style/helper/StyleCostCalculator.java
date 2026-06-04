package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.dto.StyleCostDetailDTO;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class StyleCostCalculator {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    public BigDecimal computeLiveDevCostFromBatch(
            Long styleId,
            Map<Long, List<StyleBom>> bomByStyleId,
            Map<Long, List<StyleProcess>> processByStyleId,
            Map<Long, List<SecondaryProcess>> secondaryByStyleId) {

        List<StyleBom> bomItems = bomByStyleId.getOrDefault(styleId, Collections.emptyList());
        double materialTotal = bomItems.stream().mapToDouble(bom -> {
            BigDecimal tp = bom.getTotalPrice();
            if (tp != null) return tp.doubleValue();
            double usage = bom.getUsageAmount() != null ? bom.getUsageAmount().doubleValue() : 0.0;
            double loss  = bom.getLossRate()    != null ? bom.getLossRate().doubleValue()    : 0.0;
            double up    = bom.getUnitPrice()   != null ? bom.getUnitPrice().doubleValue()   : 0.0;
            return usage * (1.0 + loss / 100.0) * up;
        }).sum();

        List<StyleProcess> processes = processByStyleId.getOrDefault(styleId, Collections.emptyList());
        double processTotal = processes.stream()
                .mapToDouble(p -> p.getPrice() != null ? p.getPrice().doubleValue() : 0.0)
                .sum();

        List<SecondaryProcess> secondaryList = secondaryByStyleId.getOrDefault(styleId, Collections.emptyList());
        double otherTotal = secondaryList.stream()
                .mapToDouble(sp -> sp.getTotalPrice() != null ? sp.getTotalPrice().doubleValue() : 0.0)
                .sum();

        return BigDecimal.valueOf(materialTotal + processTotal + otherTotal)
                .setScale(2, RoundingMode.HALF_UP);
    }

    public PatternDevelopmentStatsDTO getDevelopmentStats(String rangeType) {
        LocalDateTime startTime = getStartTimeByRange(rangeType);
        LocalDateTime endTime = LocalDateTime.now();
        return computeDevelopmentStats(startTime, endTime, rangeType);
    }

    public PatternDevelopmentStatsDTO getDevelopmentStatsByDateRange(LocalDateTime startTime, LocalDateTime endTime) {
        return computeDevelopmentStats(startTime, endTime, "custom");
    }

    private PatternDevelopmentStatsDTO computeDevelopmentStats(LocalDateTime startTime, LocalDateTime endTime, String rangeType) {
        boolean tenantScopedRead = !UserContext.isSuperAdmin();
        Long readableTenantId = resolveReadableTenantId();

        // 查询所有已完成的样衣（不限制完成时间，避免 sampleCompletedTime 为 NULL 时遗漏）
        List<StyleInfo> completedStyles = styleInfoService.lambdaQuery()
                .eq(tenantScopedRead, StyleInfo::getTenantId, readableTenantId)
                .and(w -> w.eq(StyleInfo::getSampleStatus, "COMPLETED")
                        .or().eq(StyleInfo::getSampleStatus, "Completed"))
                .list();

        // 在 Java 中按时间范围过滤，sampleCompletedTime 为 NULL 时用 updateTime 兜底
        completedStyles = completedStyles.stream()
                .filter(style -> {
                    LocalDateTime refTime = style.getSampleCompletedTime();
                    if (refTime == null) {
                        refTime = style.getUpdateTime();
                    }
                    return refTime != null
                            && !refTime.isBefore(startTime)
                            && !refTime.isAfter(endTime);
                })
                .collect(Collectors.toList());

        PatternDevelopmentStatsDTO stats = new PatternDevelopmentStatsDTO();
        stats.setRangeType(rangeType);

        int totalSampleQuantity = 0;
        double totalMaterialCost = 0.0;
        double totalProcessCost = 0.0;
        double totalOtherCost = 0.0;
        long totalDevelopmentSeconds = 0L;

        List<StyleCostDetailDTO> styleCostDetails = new ArrayList<>();

        for (StyleInfo style : completedStyles) {
            int sampleQty = style.getSampleQuantity() == null || style.getSampleQuantity() <= 0
                    ? 1
                    : style.getSampleQuantity();
            totalSampleQuantity += sampleQty;

            List<StyleBom> bomItems = styleBomService.listByStyleId(style.getId());
            double materialCost = bomItems.stream().mapToDouble(bom -> {
                BigDecimal tp = bom.getTotalPrice();
                if (tp != null) return tp.doubleValue();
                double usage = bom.getUsageAmount() != null ? bom.getUsageAmount().doubleValue() : 0.0;
                double loss  = bom.getLossRate()    != null ? bom.getLossRate().doubleValue()    : 0.0;
                double up    = bom.getUnitPrice()   != null ? bom.getUnitPrice().doubleValue()   : 0.0;
                return usage * (1.0 + loss / 100.0) * up;
            }).sum();
            totalMaterialCost += materialCost * sampleQty;

            List<StyleProcess> processes = styleProcessService.listByStyleId(style.getId());
            double processCost = processes.stream()
                    .mapToDouble(p -> p.getPrice() != null ? p.getPrice().doubleValue() : 0.0)
                    .sum();
            totalProcessCost += processCost * sampleQty;

            List<SecondaryProcess> secondaryItems = secondaryProcessService.listByStyleId(style.getId());
            double secondaryCost = secondaryItems.stream()
                    .mapToDouble(sp -> sp.getTotalPrice() != null ? sp.getTotalPrice().doubleValue() : 0.0)
                    .sum();
            totalOtherCost += secondaryCost * sampleQty;

            // 开发时间
            long devSeconds = 0L;
            if (style.getCreateTime() != null && style.getSampleCompletedTime() != null) {
                devSeconds = Duration.between(style.getCreateTime(), style.getSampleCompletedTime()).getSeconds();
                totalDevelopmentSeconds += devSeconds;
            }

            String developmentTime = "";
            if (devSeconds > 0) {
                long days = devSeconds / 86400;
                long hours = (devSeconds % 86400) / 3600;
                if (days > 0) developmentTime = days + "天" + hours + "小时";
                else developmentTime = hours + "小时";
            }

            StyleCostDetailDTO detail = StyleCostDetailDTO.builder()
                    .styleId(String.valueOf(style.getId()))
                    .styleNo(style.getStyleNo())
                    .styleName(style.getStyleName())
                    .styleImage(style.getCover())
                    .patternCount(sampleQty)
                    .developmentTime(developmentTime)
                    .developmentTimeSeconds(devSeconds > 0 ? devSeconds : null)
                    .materialCost(BigDecimal.valueOf(materialCost * sampleQty).setScale(2, RoundingMode.HALF_UP))
                    .processCost(BigDecimal.valueOf(processCost * sampleQty).setScale(2, RoundingMode.HALF_UP))
                    .secondaryProcessCost(BigDecimal.valueOf(secondaryCost * sampleQty).setScale(2, RoundingMode.HALF_UP))
                    .totalCost(BigDecimal.valueOf((materialCost + processCost + secondaryCost) * sampleQty).setScale(2, RoundingMode.HALF_UP))
                    .build();
            styleCostDetails.add(detail);
        }

        double totalCost = totalMaterialCost + totalProcessCost + totalOtherCost;

        stats.setPatternCount(totalSampleQuantity);
        stats.setMaterialCost(BigDecimal.valueOf(totalMaterialCost).setScale(2, RoundingMode.HALF_UP));
        stats.setProcessCost(BigDecimal.valueOf(totalProcessCost).setScale(2, RoundingMode.HALF_UP));
        stats.setSecondaryProcessCost(BigDecimal.valueOf(totalOtherCost).setScale(2, RoundingMode.HALF_UP));
        stats.setTotalCost(BigDecimal.valueOf(totalCost).setScale(2, RoundingMode.HALF_UP));
        stats.setTotalDevelopmentTimeSeconds(totalDevelopmentSeconds);
        stats.setStyleCostDetails(styleCostDetails);

        return stats;
    }

    private LocalDateTime getStartTimeByRange(String rangeType) {
        LocalDate today = LocalDate.now();
        switch (rangeType) {
            case "day":
                return today.atStartOfDay();
            case "week":
                return today.minusDays(today.getDayOfWeek().getValue() - 1).atStartOfDay();
            case "month":
                return today.withDayOfMonth(1).atStartOfDay();
            case "year":
                return today.withDayOfYear(1).atStartOfDay();
            default:
                return today.atStartOfDay();
        }
    }

    private Long resolveReadableTenantId() {
        Long tenantId = UserContext.tenantId();
        return tenantId != null ? tenantId : -1L;
    }
}
