package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.mapper.PatternProductionMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PatternProductionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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
public class PatternProductionServiceImpl extends ServiceImpl<PatternProductionMapper, PatternProduction>
        implements PatternProductionService {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

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

        // 1. 统计样衣数量
        LambdaQueryWrapper<PatternProduction> ppWrapper = new LambdaQueryWrapper<>();
        ppWrapper.eq(PatternProduction::getDeleteFlag, 0)
                .ge(PatternProduction::getCreateTime, startTime)
                .le(PatternProduction::getCreateTime, endTime);
        long patternCount = this.count(ppWrapper);
        stats.setPatternCount((int) patternCount);

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

        // 3. 工序单价费用（暂时返回0，因为样衣的工序单价存储在 t_style_process 中，需要通过样衣关联款式查询）
        // 如果有需要，可以通过 style_id 关联查询样衣工序费用
        stats.setProcessCost(BigDecimal.ZERO);

        // 4. 二次工艺费用（暂时返回0，t_secondary_process 通过 style_id 关联）
        // 如果有需要，可以通过样衣的 style_id 关联查询二次工艺费用
        stats.setSecondaryProcessCost(BigDecimal.ZERO);

        // 5. 计算总费用
        BigDecimal totalCost = materialCost
                .add(stats.getProcessCost())
                .add(stats.getSecondaryProcessCost());
        stats.setTotalCost(totalCost);

        return stats;
    }
}
