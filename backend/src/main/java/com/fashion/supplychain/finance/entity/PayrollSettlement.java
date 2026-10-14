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

    private BigDecimal paidAmount;

    private BigDecimal remainingAmount;

    private BigDecimal deductionAmount;

    private BigDecimal advanceAmount;

    private String paymentStatus;

    /**
     * 结算时间：本结算单被全额付清的时刻（付清时由 PayrollSettlementMapper.atomicAddPaidAmount 写入）。
     *
     * <p>此前该字段在实体和库里都不存在，而 Mapper 的 UPDATE 一直在写它 ——
     * 于是每次打款都报 {@code Unknown column 'settlement_time'} 并回滚，
     * 工资打款功能完全不可用（2026-10-14 线上修复，对应迁移 V202710140001）。
     */
    private LocalDateTime settlementTime;

    private String status;

    private String remark;

    /** 本次结算包含的扫码记录ID（逗号分隔），用于取消/反向审核时精确回滚 tracking 结算状态 */
    private String scanRecordIds;

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
