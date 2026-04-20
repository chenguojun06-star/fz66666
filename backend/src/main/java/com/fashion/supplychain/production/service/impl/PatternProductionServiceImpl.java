package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.mapper.PatternProductionMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleProcessService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

/**
 * 样板生产 Service 实现
 */
@Service
@Slf4j
public class PatternProductionServiceImpl extends ServiceImpl<PatternProductionMapper, PatternProduction>
        implements PatternProductionService {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    @Override
    public PatternDevelopmentStatsDTO getDevelopmentStats(String rangeType) {
        PatternDevelopmentStatsDTO stats = new PatternDevelopmentStatsDTO();
        stats.setRangeType(rangeType);

        // 计算时间范围
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime startTime;
        LocalDateTime endTime = now;

        switch (rangeType) {
            case "day":
                startTime = now.with(LocalTime.MIN);
                break;
            case "week":
                startTime = now.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).with(LocalTime.MIN);
                break;
            case "month":
                startTime = now.with(TemporalAdjusters.firstDayOfMonth()).with(LocalTime.MIN);
                break;
            default:
                startTime = now.with(LocalTime.MIN);
        }

        // 1. 统计样衣列表（同时用于数量统计和费用计算）
        LambdaQueryWrapper<PatternProduction> ppWrapper = new LambdaQueryWrapper<>();
        ppWrapper.eq(PatternProduction::getDeleteFlag, 0)
                .ge(PatternProduction::getCreateTime, startTime)
                .le(PatternProduction::getCreateTime, endTime);
        List<PatternProduction> patterns = this.list(ppWrapper);
        stats.setPatternCount(patterns.size());

        // 2. 统计面辅料费用（只统计样衣采购，即 sourceType='sample' 或 patternProductionId 不为空）
        LambdaQueryWrapper<MaterialPurchase> mpWrapper = new LambdaQueryWrapper<>();
        mpWrapper.eq(MaterialPurchase::getDeleteFlag, 0)
                .ge(MaterialPurchase::getCreateTime, startTime)
                .le(MaterialPurchase::getCreateTime, endTime)
                .and(w -> w.eq(MaterialPurchase::getSourceType, "sample")
                        .or().isNotNull(MaterialPurchase::getPatternProductionId));

        List<MaterialPurchase> purchases = materialPurchaseService.list(mpWrapper);
        BigDecimal materialCost = purchases.stream()
                .map(mp -> mp.getTotalAmount() != null ? mp.getTotalAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        stats.setMaterialCost(materialCost);

        // 3. 工序单价费用：样衣件数 × 该款式所有工序单价之和
        BigDecimal processCost = BigDecimal.ZERO;
        for (PatternProduction pp : patterns) {
            if (pp.getStyleId() == null || pp.getQuantity() == null || pp.getQuantity() == 0) continue;
            try {
                Long styleIdLong = Long.parseLong(pp.getStyleId());
                List<StyleProcess> processes = styleProcessService.listByStyleId(styleIdLong);
                BigDecimal totalProcessPrice = processes.stream()
                        .map(sp -> sp.getPrice() != null ? sp.getPrice() : BigDecimal.ZERO)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                processCost = processCost.add(totalProcessPrice.multiply(BigDecimal.valueOf(pp.getQuantity())));
            } catch (NumberFormatException e) {
                log.warn("[PatternProduction] 工序成本计算失败，styleId={}: {}", pp.getStyleId(), e.getMessage());
            }
        }
        stats.setProcessCost(processCost);

        // 4. 二次工艺费用：样衣件数 × 该款式所有二次工艺单价之和
        BigDecimal secondaryProcessCost = BigDecimal.ZERO;
        for (PatternProduction pp : patterns) {
            if (pp.getStyleId() == null || pp.getQuantity() == null || pp.getQuantity() == 0) continue;
            try {
                Long styleIdLong = Long.parseLong(pp.getStyleId());
                List<SecondaryProcess> secondaryProcesses = secondaryProcessService.listByStyleId(styleIdLong);
                BigDecimal totalUnitPrice = secondaryProcesses.stream()
                        .map(sp -> sp.getUnitPrice() != null ? sp.getUnitPrice() : BigDecimal.ZERO)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                secondaryProcessCost = secondaryProcessCost.add(totalUnitPrice.multiply(BigDecimal.valueOf(pp.getQuantity())));
            } catch (NumberFormatException e) {
                log.warn("[PatternProduction] 二次工艺成本计算失败，styleId={}: {}", pp.getStyleId(), e.getMessage());
            }
        }
        stats.setSecondaryProcessCost(secondaryProcessCost);

        // 5. 计算总费用
        BigDecimal totalCost = materialCost
                .add(stats.getProcessCost())
                .add(stats.getSecondaryProcessCost());
        stats.setTotalCost(totalCost);

        return stats;
    }
}
