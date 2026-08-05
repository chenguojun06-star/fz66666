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
 * 补卡申请实体
 * <p>
 * 业务流程：员工提交补卡申请 → 管理员审批通过/拒绝 → 通过后自动写入 t_work_attendance 打卡记录
 * 状态流转：PENDING → APPROVED / REJECTED
 * <p>
 * 多租户安全（P0 铁律4）：所有查询必带 tenant_id
 */
@Data
@TableName("t_attendance_supplement_apply")
public class AttendanceSupplementApply {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0 铁律4） — 由 MyBatisPlusMetaObjectHandler 自动填充；Orchestrator 也会显式 set 兜底 */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 申请人ID */
    private String userId;

    /** 申请人姓名 */
    private String userName;

    /** 工厂ID */
    private String factoryId;

    /** 补卡日期 */
    private LocalDate workDate;

    /** 上班时间（可空，至少填一项） */
    private LocalDateTime clockInTime;

    /** 下班时间（可空，至少填一项） */
    private LocalDateTime clockOutTime;

    /** 补卡原因 */
    private String reason;

    /**
     * 状态：PENDING（待审批）/ APPROVED（已通过）/ REJECTED（已拒绝）
     * 由代码层 Orchestrator.submitApply 显式 setStatus("PENDING") 控制
     */
    private String status;

    /** 审批人ID */
    private String approverId;

    /** 审批人姓名 */
    private String approverName;

    /** 审批时间 */
    private LocalDateTime approveTime;

    /** 审批备注 */
    private String approveRemark;

    /** 审批通过后关联的 t_work_attendance 打卡记录ID */
    private Long attendanceId;

    /** 0未删 1已删 */
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
