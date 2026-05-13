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
@TableName("t_employee_advance")
public class EmployeeAdvance {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String advanceNo;
    private String employeeId;
    private String employeeName;
    private String factoryId;
    private String factoryName;
    private BigDecimal amount;
    private String reason;
    private String status;
    private String orderNo;
    private String approverId;
    private String approverName;
    private LocalDateTime approvalTime;
    private String approvalRemark;
    private BigDecimal repaymentAmount;
    private BigDecimal remainingAmount;
    private String repaymentStatus;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleteFlag;
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
