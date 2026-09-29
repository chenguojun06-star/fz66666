package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.entity.FactoryCalendar;
import com.fashion.supplychain.intelligence.entity.ProcessCapacity;
import com.fashion.supplychain.intelligence.service.FactoryCalendarService;
import com.fashion.supplychain.intelligence.service.ProcessCapacityService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

/**
 * APS 排产基础配置编排层（工序产能 + 工厂工作日历）
 *
 * <p>排产求解本身在 {@link ApsSchedulingOrchestrator}；本类只管排产所需的**基础数据**读写。
 * 拆开是因为求解器是纯算法（{@code @Lazy} + Helper），而配置读写是常规 CRUD，混在一起
 * 会让求解器被迫加载 Service 依赖。
 *
 * <p>{@code ApsSchedulingController} 原先直接注入 {@code ProcessCapacityService} 与
 * {@code FactoryCalendarService}（D-630 规则6 违规），现统一由本层承接。
 *
 * <p><b>返回 {@link Result}：</b>与重构前 {@code try/catch → Result.fail} 的响应语义逐字一致
 * （HTTP 200 + code 500），避免改变前端可观测行为。
 */
@Slf4j
@Service
public class ApsCapacityOrchestrator {

    @Autowired
    private ProcessCapacityService processCapacityService;

    @Autowired
    private FactoryCalendarService factoryCalendarService;

    /** 查询工序产能配置（可按工厂名过滤）。 */
    public Result<List<ProcessCapacity>> listProcessCapacity(String factoryName) {
        return Result.success(processCapacityService.list(factoryName));
    }

    /** 保存工序产能配置（新增或更新）。 */
    public Result<ProcessCapacity> saveProcessCapacity(ProcessCapacity capacity) {
        try {
            return Result.success(processCapacityService.save(capacity));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 查询工厂工作日历。 */
    public Result<List<FactoryCalendar>> listFactoryCalendar(String factoryId, LocalDate startDate, LocalDate endDate) {
        return Result.success(factoryCalendarService.list(factoryId, startDate, endDate));
    }

    /** 保存工厂工作日历记录（新增或更新）。 */
    public Result<FactoryCalendar> saveFactoryCalendar(FactoryCalendar calendar) {
        try {
            return Result.success(factoryCalendarService.save(calendar));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }
}
