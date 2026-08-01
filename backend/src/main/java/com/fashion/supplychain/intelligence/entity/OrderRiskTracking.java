package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_order_risk_tracking")
public class OrderRiskTracking {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String orderNo;

    private String riskLevel;

    private String riskFactors;

    private String assignedTo;

    private String handlingStatus;

    private String handlingAction;

    private String handlingResult;

    private String handledBy;

    private LocalDateTime handledAt;

    /** 撤销时间 */
    private LocalDateTime cancelledAt;
    /** 撤销人 */
    private String cancelledBy;
    /** 撤销原因 */
    private String cancelReason;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
