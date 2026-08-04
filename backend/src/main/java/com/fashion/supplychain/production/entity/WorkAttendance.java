package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.FieldFill;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 员工打卡记录实体
 * 用于本月工时统计：本月工时 = SUM(work_minutes) / 60
 * 多租户安全（P0 铁律4）：所有查询必带 tenant_id
 */
@Data
@TableName("t_work_attendance")
public class WorkAttendance {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0 铁律4） — 由 MyBatisPlusMetaObjectHandler 自动填充；Orchestrator 也会显式 set 兜底 */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 员工ID */
    private String userId;

    /** 员工姓名 */
    private String userName;

    /** 工厂ID */
    private String factoryId;

    /** 上班打卡时间 */
    private LocalDateTime clockInTime;

    /** 下班打卡时间 */
    private LocalDateTime clockOutTime;

    /** 打卡日期（yyyy-MM-dd） */
    private LocalDate workDate;

    /** 当日工时（分钟） */
    private Integer workMinutes;

    /** 来源：manual/auto_scan/admin_adjust */
    private String source;

    /** 打卡位置（可选） */
    private String location;

    /**
     * 打卡状态：
     * NORMAL/LATE/EARLY_LEAVE/LATE_EARLY_LEAVE/MISSING_CLOCK_OUT/ABNORMAL
     * LEAVE（休假） / ADJUSTED（管理员调整） / CANCELLED（作废）
     * NULL = 历史数据（按时间自动判定，向后兼容）
     */
    private String status;

    /**
     * 休假类型：LEGAL_HOLIDAY/SICK/PERSONAL/ANNUAL/MATERNITY/OTHER
     * 仅 status=LEAVE 时有值
     */
    private String leaveType;

    /** 操作人ID（管理员补录/调整时记录，员工自打卡时为空） */
    private String operatorId;

    /** 操作人姓名 */
    private String operatorName;

    /** 操作时间（管理员操作时间） */
    private LocalDateTime operateTime;

    /** 备注 */
    private String remark;

    /** 0未删 1已删 */
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
