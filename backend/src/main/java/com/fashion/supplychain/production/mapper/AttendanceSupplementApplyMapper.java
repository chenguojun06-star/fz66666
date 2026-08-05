package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.AttendanceSupplementApply;
import java.time.LocalDate;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 补卡申请 Mapper
 * <p>
 * 多租户安全（P0 铁律4）：所有查询必带 tenant_id
 */
public interface AttendanceSupplementApplyMapper extends BaseMapper<AttendanceSupplementApply> {

    /**
     * 员工查看自己的申请列表（按月筛选）
     * @param tenantId 租户ID（必填，P0 铁律4）
     * @param userId 申请人ID
     * @param monthStart 月份起始日（yyyy-MM-01）
     * @param monthEnd   月份结束日（次月 1 日）
     */
    @Select("SELECT * FROM t_attendance_supplement_apply " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND user_id = #{userId} " +
            "  AND delete_flag = 0 " +
            "  AND work_date >= #{monthStart} " +
            "  AND work_date <  #{monthEnd} " +
            "ORDER BY work_date DESC, id DESC")
    List<AttendanceSupplementApply> selectMyApplies(@Param("tenantId") Long tenantId,
                                                    @Param("userId") String userId,
                                                    @Param("monthStart") LocalDate monthStart,
                                                    @Param("monthEnd") LocalDate monthEnd);

    /**
     * 管理员待审批列表（按日期范围筛选，仅 PENDING 状态）
     * @param tenantId 租户ID（必填，P0 铁律4）
     * @param startDate 起始日期（含）
     * @param endDate   结束日期（含）
     */
    @Select("SELECT * FROM t_attendance_supplement_apply " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND status = 'PENDING' " +
            "  AND delete_flag = 0 " +
            "  AND work_date >= #{startDate} " +
            "  AND work_date <= #{endDate} " +
            "ORDER BY work_date ASC, id ASC")
    List<AttendanceSupplementApply> selectPendingList(@Param("tenantId") Long tenantId,
                                                      @Param("startDate") LocalDate startDate,
                                                      @Param("endDate") LocalDate endDate);

    /**
     * 查询某员工某天的待审批申请（用于提交申请时检查重复）
     */
    @Select("SELECT * FROM t_attendance_supplement_apply " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND user_id = #{userId} " +
            "  AND work_date = #{workDate} " +
            "  AND status = 'PENDING' " +
            "  AND delete_flag = 0 " +
            "LIMIT 1")
    AttendanceSupplementApply selectPendingByUserDate(@Param("tenantId") Long tenantId,
                                                      @Param("userId") String userId,
                                                      @Param("workDate") LocalDate workDate);
}
