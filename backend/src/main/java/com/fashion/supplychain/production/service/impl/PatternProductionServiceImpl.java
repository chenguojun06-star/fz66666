package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.dto.StyleCostDetailDTO;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.mapper.PatternProductionMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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

    @Autowired
    private StyleInfoService styleInfoService;

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
                .le(PatternProduction::getCreateTime, endTime)
                .eq(PatternProduction::getTenantId, UserContext.tenantId());
        List<PatternProduction> patterns = this.list(ppWrapper);
        stats.setPatternCount(patterns.size());

        // 用于存储每款成本明细的 Map：styleId -> StyleCostDetailDTO.Builder
        Map<String, StyleCostDetailDTO.StyleCostDetailDTOBuilder> styleCostMap = new LinkedHashMap<>();

        // 按款式分组统计开发时间
        Map<String, Long> styleDevelopmentTimeMap = patterns.stream()
                .filter(pp -> pp.getStyleId() != null && pp.getCreateTime() != null)
                .collect(Collectors.groupingBy(
                        PatternProduction::getStyleId,
                        Collectors.collectingAndThen(
                                Collectors.mapping(PatternProduction::getCreateTime, Collectors.toList()),
                                times -> {
                                    LocalDateTime earliest = times.stream().min(LocalDateTime::compareTo).orElse(null);
                                    LocalDateTime latest = times.stream().max(LocalDateTime::compareTo).orElse(null);
                                    if (earliest != null && latest != null) {
                                        return java.time.Duration.between(earliest, latest).getSeconds();
                                    }
                                    return 0L;
                                }
                        )
                ));

        // 2. 统计面辅料费用（只统计样衣采购，即 sourceType='sample' 或 patternProductionId 不为空）
        LambdaQueryWrapper<MaterialPurchase> mpWrapper = new LambdaQueryWrapper<>();
        mpWrapper.eq(MaterialPurchase::getDeleteFlag, 0)
                .ge(MaterialPurchase::getCreateTime, startTime)
                .le(MaterialPurchase::getCreateTime, endTime)
                .eq(MaterialPurchase::getTenantId, UserContext.tenantId())
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
                BigDecimal ppProcessCost = totalProcessPrice.multiply(BigDecimal.valueOf(pp.getQuantity()));
                processCost = processCost.add(ppProcessCost);

                // 累计到款式成本明细
                styleCostMap.computeIfAbsent(pp.getStyleId(), k -> StyleCostDetailDTO.builder()
                        .styleId(pp.getStyleId())
                        .styleNo(pp.getStyleNo() != null ? pp.getStyleNo() : "")
                        .styleName(""))
                    .processCost(ppProcessCost)
                    .patternCount(pp.getQuantity());
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
                BigDecimal ppSecondaryCost = totalUnitPrice.multiply(BigDecimal.valueOf(pp.getQuantity()));
                secondaryProcessCost = secondaryProcessCost.add(ppSecondaryCost);

                // 累计到款式成本明细
                StyleCostDetailDTO.StyleCostDetailDTOBuilder builder = styleCostMap.get(pp.getStyleId());
                if (builder != null) {
                    builder.secondaryProcessCost(ppSecondaryCost);
                }
            } catch (NumberFormatException e) {
                log.warn("[PatternProduction] 二次工艺成本计算失败，styleId={}: {}", pp.getStyleId(), e.getMessage());
            }
        }
        stats.setSecondaryProcessCost(secondaryProcessCost);

        // 5. 计算每款总费用并添加到列表
        List<StyleCostDetailDTO> styleCostDetails = styleCostMap.entrySet().stream()
                .map(entry -> {
                    String styleId = entry.getKey();
                    StyleCostDetailDTO.StyleCostDetailDTOBuilder builder = entry.getValue();
                    
                    // 设置开发时间
                    Long devSeconds = styleDevelopmentTimeMap.get(styleId);
                    if (devSeconds != null && devSeconds > 0) {
                        long days = devSeconds / 86400;
                        long hours = (devSeconds % 86400) / 3600;
                        String devTime;
                        if (days > 0) {
                            devTime = days + "天" + hours + "小时";
                        } else {
                            devTime = hours + "小时";
                        }
                        builder.developmentTime(devTime);
                    }
                    
                    // 获取款式图片
                    try {
                        Long styleIdLong = Long.parseLong(styleId);
                        StyleInfo styleInfo = styleInfoService.getById(styleIdLong);
                        if (styleInfo != null && styleInfo.getCover() != null) {
                            builder.styleImage(styleInfo.getCover());
                        }
                    } catch (NumberFormatException e) {
                        // styleId 不是数字，忽略
                    }
                    
                    StyleCostDetailDTO dto = builder.build();
                    dto.setTotalCost(
                            (dto.getMaterialCost() != null ? dto.getMaterialCost() : BigDecimal.ZERO)
                            .add(dto.getProcessCost() != null ? dto.getProcessCost() : BigDecimal.ZERO)
                            .add(dto.getSecondaryProcessCost() != null ? dto.getSecondaryProcessCost() : BigDecimal.ZERO)
                    );
                    return dto;
                })
                .sorted((a, b) -> b.getTotalCost().compareTo(a.getTotalCost())) // 按总费用降序排列
                .collect(Collectors.toList());
        stats.setStyleCostDetails(styleCostDetails);

        // 6. 计算开发时间统计（从最早到最晚）
        if (patterns != null && !patterns.isEmpty()) {
            LocalDateTime earliest = patterns.stream()
                    .map(PatternProduction::getCreateTime)
                    .filter(t -> t != null)
                    .min(LocalDateTime::compareTo)
                    .orElse(null);
            LocalDateTime latest = patterns.stream()
                    .map(PatternProduction::getCreateTime)
                    .filter(t -> t != null)
                    .max(LocalDateTime::compareTo)
                    .orElse(null);
            if (earliest != null && latest != null) {
                long seconds = java.time.Duration.between(earliest, latest).getSeconds();
                stats.setTotalDevelopmentTimeSeconds(seconds);
            }
        }

        // 7. 计算总费用
        BigDecimal totalCost = materialCost
                .add(stats.getProcessCost())
                .add(stats.getSecondaryProcessCost());
        stats.setTotalCost(totalCost);

        return stats;
    }
}
