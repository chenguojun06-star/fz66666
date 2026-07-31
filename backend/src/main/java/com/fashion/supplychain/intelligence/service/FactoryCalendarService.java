package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.FactoryCalendar;
import com.fashion.supplychain.intelligence.mapper.FactoryCalendarMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 工厂工作日历服务（APS 排产引擎）
 *
 * <p>不加 @Transactional（D-001：Service 层禁止事务）</p>
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FactoryCalendarService {

    private final FactoryCalendarMapper factoryCalendarMapper;

    /**
     * 查询工厂在日期范围内的工作日集合（P0铁律4：多租户隔离）
     *
     * @param factoryId 工厂ID
     * @param startDate 开始日期
     * @param endDate   结束日期
     * @return 工作日日期集合（未配置日历时，返回空集合，由调用方按工作日处理）
     */
    public Set<LocalDate> loadWorkdays(String factoryId, LocalDate startDate, LocalDate endDate) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || factoryId == null) {
            return new HashSet<>();
        }
        List<FactoryCalendar> workdays = factoryCalendarMapper.listWorkdays(tenantId, factoryId, startDate, endDate);
        Set<LocalDate> result = new HashSet<>();
        for (FactoryCalendar fc : workdays) {
            if (fc.getCalendarDate() != null) {
                result.add(fc.getCalendarDate());
            }
        }
        return result;
    }

    /**
     * 查询工厂某日是否为工作日（P0铁律4：多租户隔离）
     * 未配置日历时，按工作日处理（返回 true）
     *
     * @param factoryId 工厂ID
     * @param date      日期
     * @return true=工作日 / false=休息日
     */
    public boolean isWorkday(String factoryId, LocalDate date) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || factoryId == null || date == null) {
            return true;
        }
        FactoryCalendar fc = factoryCalendarMapper.findByDate(tenantId, factoryId, date);
        return fc == null || fc.getIsWorkday() == null || fc.getIsWorkday() == 1;
    }

    /**
     * 列表查询工作日历（带租户隔离）
     *
     * @param factoryId 工厂ID（可选）
     * @param startDate 开始日期（可选）
     * @param endDate   结束日期（可选）
     * @return 工作日历列表
     */
    public List<FactoryCalendar> list(String factoryId, LocalDate startDate, LocalDate endDate) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return List.of();
        }
        LambdaQueryWrapper<FactoryCalendar> wrapper = new LambdaQueryWrapper<FactoryCalendar>()
                .eq(FactoryCalendar::getTenantId, tenantId);
        if (factoryId != null) {
            wrapper.eq(FactoryCalendar::getFactoryId, factoryId);
        }
        if (startDate != null) {
            wrapper.ge(FactoryCalendar::getCalendarDate, startDate);
        }
        if (endDate != null) {
            wrapper.le(FactoryCalendar::getCalendarDate, endDate);
        }
        wrapper.orderByAsc(FactoryCalendar::getCalendarDate);
        return factoryCalendarMapper.selectList(wrapper);
    }

    /**
     * 保存工作日历记录（新增或更新，P0铁律4：多租户隔离）
     *
     * @param calendar 工作日历记录
     * @return 保存后的记录
     */
    public FactoryCalendar save(FactoryCalendar calendar) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("租户ID不能为空");
        }
        if (calendar.getFactoryId() == null) {
            throw new IllegalArgumentException("工厂ID不能为空");
        }
        if (calendar.getCalendarDate() == null) {
            throw new IllegalArgumentException("日历日期不能为空");
        }

        calendar.setTenantId(tenantId);

        LambdaQueryWrapper<FactoryCalendar> existsWrapper = new LambdaQueryWrapper<FactoryCalendar>()
                .eq(FactoryCalendar::getTenantId, tenantId)
                .eq(FactoryCalendar::getFactoryId, calendar.getFactoryId())
                .eq(FactoryCalendar::getCalendarDate, calendar.getCalendarDate());
        FactoryCalendar existing = factoryCalendarMapper.selectOne(existsWrapper);

        if (existing != null) {
            calendar.setId(existing.getId());
            factoryCalendarMapper.updateById(calendar);
            log.info("[FactoryCalendar] 更新工作日历 id={} factory={} date={}",
                    existing.getId(), calendar.getFactoryId(), calendar.getCalendarDate());
        } else {
            factoryCalendarMapper.insert(calendar);
            log.info("[FactoryCalendar] 新增工作日历 id={} factory={} date={}",
                    calendar.getId(), calendar.getFactoryId(), calendar.getCalendarDate());
        }
        return calendar;
    }
}
