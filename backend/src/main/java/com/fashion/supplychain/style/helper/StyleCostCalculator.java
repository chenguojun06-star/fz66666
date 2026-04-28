package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.common.UserContext;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

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

    public Map<String, Object> getDevelopmentStats(String rangeType) {
        LocalDateTime startTime = getStartTimeByRange(rangeType);
        LocalDateTime endTime = LocalDateTime.now();

        boolean tenantScopedRead = !UserContext.isSuperAdmin();
        Long readableTenantId = resolveReadableTenantId();

        List<StyleInfo> completedStyles = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getSampleStatus, "COMPLETED")
                .eq(tenantScopedRead, StyleInfo::getTenantId, readableTenantId)
                .ge(StyleInfo::getSampleCompletedTime, startTime)
                .le(StyleInfo::getSampleCompletedTime, endTime)
                .list();

        int totalSampleQuantity = 0;
        double totalMaterialCost = 0.0;
        double totalProcessCost = 0.0;
        double totalOtherCost = 0.0;

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
        }

        double totalCost = totalMaterialCost + totalProcessCost + totalOtherCost;

        Map<String, Object> stats = new HashMap<>();
        stats.put("patternCount", totalSampleQuantity);
        stats.put("materialCost", totalMaterialCost);
        stats.put("processCost", totalProcessCost);
        stats.put("secondaryProcessCost", totalOtherCost);
        stats.put("totalCost", totalCost);

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
