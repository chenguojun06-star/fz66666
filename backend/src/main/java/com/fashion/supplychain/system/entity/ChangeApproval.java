package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 变更审批申请记录
 * 重要操作（撤回扫码/删除订单/删除款式等）流转到组织管理人审批后方可执行
 */
@Data
@TableName("t_change_approval")
public class ChangeApproval {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 操作类型: SCAN_UNDO / ORDER_DELETE / ORDER_MODIFY / STYLE_DELETE / SAMPLE_DELETE */
    private String operationType;

    /** 被操作记录ID（扫码recordId / 订单id / 款式id） */
    private String targetId;

    /** 业务单号，前端显示用 */
    private String targetNo;

    /** 操作参数JSON（审批通过后用于执行真实操作） */
    private String operationData;

    private String applicantId;
    private String applicantName;

    /** 申请人所属组织节点 */
    private String orgUnitId;
    private String orgUnitName;

    /** 审批人（该组织节点的管理人） */
    private String approverId;
    private String approverName;

    /** 申请说明 */
    private String applyReason;

    /** 状态: PENDING / APPROVED / REJECTED / CANCELLED */
    private String status;

    /** 审批意见 */
    private String reviewRemark;

    private LocalDateTime reviewTime;
    private LocalDateTime applyTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
