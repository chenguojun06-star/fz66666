package com.fashion.supplychain.crm.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_receivable_receipt_log")
public class ReceivableReceiptLog {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String receivableId;

    private String receivableNo;

    private String customerId;

    private String customerName;

    private String sourceBizType;

    private String sourceBizId;

    private String sourceBizNo;

    private BigDecimal receivedAmount;

    private String remark;

    private LocalDateTime receivedTime;

    private String operatorId;

    private String operatorName;

    private Long tenantId;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
