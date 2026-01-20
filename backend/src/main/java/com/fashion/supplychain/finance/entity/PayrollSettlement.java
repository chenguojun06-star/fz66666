package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_payroll_settlement")
public class PayrollSettlement {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String settlementNo;

    private String orderId;

    private String orderNo;

    private String styleId;

    private String styleNo;

    private String styleName;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private Integer totalQuantity;

    private BigDecimal totalAmount;

    private String status;

    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private String createBy;

    private String updateBy;
}
