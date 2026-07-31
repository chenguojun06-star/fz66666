package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_payroll_settlement_item")
public class PayrollSettlementItem {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String settlementId;

    private String operatorId;

    private String operatorName;

    private String processName;

    private Integer quantity;

    private BigDecimal unitPrice;

    private BigDecimal totalAmount;

    private String orderId;

    private String orderNo;

    private String styleNo;

    private String color;

    private String size;

    private String processCode;

    private Integer cuttingBundleNo;

    private String scanType;

    /** 关联的扫码记录ID列表（逗号分隔，精确追溯用） */
    private String scanRecordIds;

    /** 关联的工序跟踪记录ID列表（逗号分隔，精准回滚用） */
    private String trackingIds;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
