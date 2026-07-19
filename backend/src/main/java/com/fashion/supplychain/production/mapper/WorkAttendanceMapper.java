package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.WorkAttendance;
import java.time.LocalDate;
import java.util.Map;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 员工打卡 Mapper
 * 多租户安全（P0 铁律4）：所有查询必带 tenant_id
 */
public interface WorkAttendanceMapper extends BaseMapper<WorkAttendance> {

    /**
     * 查询今日打卡记录
     */
    @Select("SELECT * FROM t_work_attendance " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND user_id = #{userId} " +
            "  AND work_date = #{workDate} " +
            "  AND delete_flag = 0 " +
            "LIMIT 1")
    WorkAttendance selectToday(@Param("tenantId") Long tenantId,
                              @Param("userId") String userId,
                              @Param("workDate") LocalDate workDate);

    /**
     * 月度工时统计
     * - workHours: 本月工时（小时，保留1位小数）
     * - workDays:  本月出勤天数
     * - monthMinutes: 本月工时（分钟）
     */
    @Select("SELECT " +
            "  COALESCE(ROUND(SUM(work_minutes) / 60.0, 1), 0) AS workHours, " +
            "  COUNT(*) AS workDays, " +
            "  COALESCE(SUM(work_minutes), 0) AS monthMinutes " +
            "FROM t_work_attendance " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND user_id = #{userId} " +
            "  AND delete_flag = 0 " +
            "  AND work_date >= DATE_FORMAT(#{month}, '%Y-%m-01') " +
            "  AND work_date <  DATE_ADD(DATE_FORMAT(#{month}, '%Y-%m-01'), INTERVAL 1 MONTH)")
    Map<String, Object> selectMonthlyStats(@Param("tenantId") Long tenantId,
                                          @Param("userId") String userId,
                                          @Param("month") LocalDate month);
}
