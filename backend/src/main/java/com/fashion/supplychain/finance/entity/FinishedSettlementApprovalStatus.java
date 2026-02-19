package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 成品结算审批状态
 */
@Data
@TableName("t_finished_settlement_approval")
public class FinishedSettlementApprovalStatus {

    /** 结算记录ID（对应成品结算ID） */
    @TableId
    private String settlementId;

    /** 审批状态：pending/approved */
    private String status;

    /** 审批人ID */
    private String approvedById;

    /** 审批人名称 */
    private String approvedByName;

    /** 审批时间 */
    private LocalDateTime approvedTime;

    /** 租户ID */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 创建时间 */
    private LocalDateTime createTime;

    /** 更新时间 */
    private LocalDateTime updateTime;
}
