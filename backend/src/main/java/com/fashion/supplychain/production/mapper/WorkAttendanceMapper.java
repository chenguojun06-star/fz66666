package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.WorkAttendance;
import java.time.LocalDate;
import java.util.List;
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

    /**
     * 查询最近一条「未下班打卡」记录（clock_out_time IS NULL）
     * <p>用于跨天下班打卡兜底：例如 day1 23:55 上班打卡，day2 00:30 下班打卡时，
     * 今日（day2）无记录，需找到 day1 的上班卡补下班时间，避免工时丢失。
     */
    @Select("SELECT * FROM t_work_attendance " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND user_id = #{userId} " +
            "  AND clock_out_time IS NULL " +
            "  AND delete_flag = 0 " +
            "ORDER BY clock_in_time DESC " +
            "LIMIT 1")
    WorkAttendance selectLatestOpen(@Param("tenantId") Long tenantId,
                                    @Param("userId") String userId);

    /**
     * 查询指定月份的全部打卡明细（按 work_date 升序）
     * 用于手机端考勤详情页：展示哪天打了/没打、每天多少小时
     */
    @Select("SELECT * FROM t_work_attendance " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND user_id = #{userId} " +
            "  AND delete_flag = 0 " +
            "  AND work_date >= DATE_FORMAT(#{month}, '%Y-%m-01') " +
            "  AND work_date <  DATE_ADD(DATE_FORMAT(#{month}, '%Y-%m-01'), INTERVAL 1 MONTH) " +
            "ORDER BY work_date ASC")
    List<WorkAttendance> selectMonthlyRecords(@Param("tenantId") Long tenantId,
                                              @Param("userId") String userId,
                                              @Param("month") LocalDate month);

    /**
     * 管理端列表查询：按租户 + 日期范围 + 用户(可选) + 状态(可选) 筛选
     * 多租户安全（P0 铁律4）：强制 tenant_id
     */
    @Select("<script>" +
            "SELECT * FROM t_work_attendance " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND delete_flag = 0 " +
            "  AND work_date &gt;= #{startDate} " +
            "  AND work_date &lt;= #{endDate} " +
            "<if test='userId != null and userId != \"\"'> AND user_id = #{userId} </if>" +
            "<if test='status != null and status != \"\"'> AND status = #{status} </if>" +
            "ORDER BY work_date DESC, id DESC" +
            "</script>")
    List<WorkAttendance> selectForAdmin(@Param("tenantId") Long tenantId,
                                        @Param("startDate") LocalDate startDate,
                                        @Param("endDate") LocalDate endDate,
                                        @Param("userId") String userId,
                                        @Param("status") String status);

    /**
     * 管理端统计：按租户 + 日期范围 统计各状态数量
     */
    @Select("SELECT " +
            "  COUNT(*) AS total, " +
            "  SUM(CASE WHEN status = 'LEAVE' OR status = 'ADJUSTED' OR status = 'CANCELLED' THEN 0 ELSE 1 END) AS normalCount, " +
            "  SUM(CASE WHEN status = 'LEAVE' THEN 1 ELSE 0 END) AS leaveCount, " +
            "  SUM(CASE WHEN status = 'ADJUSTED' THEN 1 ELSE 0 END) AS adjustedCount, " +
            "  SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelledCount, " +
            "  COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 0 ELSE work_minutes END), 0) AS totalMinutes " +
            "FROM t_work_attendance " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND delete_flag = 0 " +
            "  AND work_date >= #{startDate} " +
            "  AND work_date <= #{endDate}")
    Map<String, Object> selectAdminStats(@Param("tenantId") Long tenantId,
                                         @Param("startDate") LocalDate startDate,
                                         @Param("endDate") LocalDate endDate);

    /**
     * 查询某员工指定日期范围内的所有打卡记录（用于批量休假检查重复）
     */
    @Select("<script>" +
            "SELECT * FROM t_work_attendance " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND user_id = #{userId} " +
            "  AND delete_flag = 0 " +
            "  AND work_date &gt;= #{startDate} " +
            "  AND work_date &lt;= #{endDate} " +
            "ORDER BY work_date ASC" +
            "</script>")
    List<WorkAttendance> selectByUserAndDateRange(@Param("tenantId") Long tenantId,
                                                  @Param("userId") String userId,
                                                  @Param("startDate") LocalDate startDate,
                                                  @Param("endDate") LocalDate endDate);
}
