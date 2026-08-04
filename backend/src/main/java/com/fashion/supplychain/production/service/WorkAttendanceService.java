package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.WorkAttendance;
import java.time.LocalDate;
import java.util.List;
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
     * 查询最近一条未下班打卡记录（跨天补卡兜底用）
     */
    WorkAttendance findLatestOpen(Long tenantId, String userId);

    /**
     * 月度工时统计
     */
    Map<String, Object> monthlyStats(Long tenantId, String userId, LocalDate month);

    /**
     * 查询指定月份的全部打卡明细（按 work_date 升序）
     * 用于手机端考勤详情页：展示哪天打了/没打、每天多少小时
     */
    List<WorkAttendance> listMonthlyRecords(Long tenantId, String userId, LocalDate month);
}
