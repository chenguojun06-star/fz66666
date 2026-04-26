package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_wage_settlement_feedback")
public class WageSettlementFeedback {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String settlementId;

    private String operatorId;

    private String operatorName;

    private String feedbackType;

    private String feedbackContent;

    private String status;

    private String resolveRemark;

    private String resolverId;

    private String resolverName;

    private LocalDateTime resolveTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
