package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.WorkAttendance;
import java.time.LocalDate;
import java.util.Map;

/**
 * 员工打卡 Service
 */
public interface WorkAttendanceService extends IService<WorkAttendance> {

    /**
     * 查询今日打卡记录
     */
    WorkAttendance findToday(Long tenantId, String userId, LocalDate workDate);

    /**
     * 月度工时统计
     */
    Map<String, Object> monthlyStats(Long tenantId, String userId, LocalDate month);
}
