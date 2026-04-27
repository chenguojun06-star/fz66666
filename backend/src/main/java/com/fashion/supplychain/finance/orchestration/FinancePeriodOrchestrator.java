package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.FinancePeriod;
import com.fashion.supplychain.finance.service.FinancePeriodService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class FinancePeriodOrchestrator {

    private final FinancePeriodService periodService;

    public Result<List<FinancePeriod>> list(Integer year) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<FinancePeriod> qw = new LambdaQueryWrapper<>();
        qw.eq(FinancePeriod::getTenantId, tenantId);
        if (year != null) {
            qw.eq(FinancePeriod::getYear, year);
        }
        qw.orderByDesc(FinancePeriod::getYear).orderByAsc(FinancePeriod::getMonth);
        qw.last("LIMIT 500");

        return Result.success(periodService.list(qw));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<FinancePeriod> lock(Integer year, Integer month, String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        FinancePeriod period = periodService.lambdaQuery()
                .eq(FinancePeriod::getTenantId, tenantId)
                .eq(FinancePeriod::getYear, year)
                .eq(FinancePeriod::getMonth, month)
                .one();

        if (period == null) {
            period = new FinancePeriod();
            period.setYear(year);
            period.setMonth(month);
            period.setStartDate(LocalDate.of(year, month, 1));
            period.setEndDate(LocalDate.of(year, month, 1).plusMonths(1).minusDays(1));
            period.setTenantId(tenantId);
            period.setCreateTime(LocalDateTime.now());
        }

        if ("LOCKED".equals(period.getStatus())) {
            return Result.fail("该期间已锁定");
        }

        period.setStatus("LOCKED");
        period.setLockedBy(UserContext.userId());
        period.setLockedTime(LocalDateTime.now());
        period.setRemark(remark);
        period.setUpdateTime(LocalDateTime.now());

        periodService.saveOrUpdate(period);

        log.info("[财务期间] 锁定: {}-{}, tenantId={}", year, month, tenantId);
        return Result.success(period);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<FinancePeriod> unlock(Integer year, Integer month) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        FinancePeriod period = periodService.lambdaQuery()
                .eq(FinancePeriod::getTenantId, tenantId)
                .eq(FinancePeriod::getYear, year)
                .eq(FinancePeriod::getMonth, month)
                .one();

        if (period == null) {
            return Result.fail("期间不存在");
        }
        if (!"LOCKED".equals(period.getStatus())) {
            return Result.fail("该期间未锁定");
        }

        period.setStatus("OPEN");
        period.setLockedBy(null);
        period.setLockedTime(null);
        period.setUpdateTime(LocalDateTime.now());
        periodService.updateById(period);

        log.info("[财务期间] 解锁: {}-{}, tenantId={}", year, month, tenantId);
        return Result.success(period);
    }

    public boolean isPeriodLocked(Long tenantId, LocalDate date) {
        if (tenantId == null) {
            return false;
        }
        FinancePeriod period = periodService.lambdaQuery()
                .eq(FinancePeriod::getTenantId, tenantId)
                .eq(FinancePeriod::getYear, date.getYear())
                .eq(FinancePeriod::getMonth, date.getMonthValue())
                .one();
        return period != null && "LOCKED".equals(period.getStatus());
    }
}
