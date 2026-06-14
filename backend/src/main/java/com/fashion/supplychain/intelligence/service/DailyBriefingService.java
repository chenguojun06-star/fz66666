package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.intelligence.entity.DailyBriefing;
import com.fashion.supplychain.intelligence.mapper.DailyBriefingMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DailyBriefingService {

    @Autowired
    private DailyBriefingMapper mapper;

    public DailyBriefing getToday(Long tenantId) {
        if (tenantId == null) {
            return null;
        }
        return mapper.selectOne(
                new LambdaQueryWrapper<DailyBriefing>()
                        .eq(DailyBriefing::getTenantId, tenantId)
                        .eq(DailyBriefing::getBriefingDate, LocalDate.now())
                        .orderByDesc(DailyBriefing::getId)
                        .last("LIMIT 1")
        );
    }

    public DailyBriefing generate(Long tenantId) {
        DailyBriefing b = new DailyBriefing();
        b.setTenantId(tenantId);
        b.setBriefingDate(LocalDate.now());
        b.setTotalOrders(0);
        b.setPendingOrders(0);
        b.setAtRiskOrders(0);
        b.setTotalProductionProgress(0.0);
        b.setDelayedStyleCount(0);
        b.setLowStockItems(0);
        b.setWagePendingAmount(BigDecimal.ZERO);
        b.setSummary("今日暂无待处理订单，系统健康");
        b.setGeneratedAt(LocalDateTime.now());

        DailyBriefing existing = mapper.selectOne(
                new LambdaQueryWrapper<DailyBriefing>()
                        .eq(DailyBriefing::getTenantId, tenantId)
                        .eq(DailyBriefing::getBriefingDate, LocalDate.now())
                        .orderByDesc(DailyBriefing::getId)
                        .last("LIMIT 1")
        );

        if (existing != null) {
            mapper.update(b, new LambdaUpdateWrapper<DailyBriefing>()
                    .eq(DailyBriefing::getId, existing.getId()));
            b.setId(existing.getId());
            return b;
        }

        mapper.insert(b);
        return b;
    }
}
