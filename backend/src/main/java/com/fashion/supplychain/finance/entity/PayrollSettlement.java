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

    // ==================== 操作人字段（自动填充）====================

    private String auditorId;

    private String auditorName;

    private LocalDateTime auditTime;

    private String confirmerId;

    private String confirmerName;

    private LocalDateTime confirmTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
