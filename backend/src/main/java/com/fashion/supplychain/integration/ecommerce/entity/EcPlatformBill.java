package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Phase 3 平台账单对账实体
 * 对应 t_ec_platform_bill 表。
 * 由 EcBillReconciliationOrchestrator 拉取平台账单 → 与本地 EcSalesRevenue 比对 → AI 分析差异。
 */
@Data
@TableName("t_ec_platform_bill")
public class EcPlatformBill {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String platform;
    private String shopName;

    /** 账期：如 2026-07 或 2026-W27 */
    private String billPeriod;

    /** 账单来源：PLATFORM/DISTRIBUTOR（Phase 4 复用对账表） */
    private String billSource;

    /** 分销商ID（bill_source=DISTRIBUTOR时必填） */
    private Long distributorId;

    private String billNo;

    /** 平台原始订单号 */
    private String platformOrderNo;

    /** 关联本地收入流水ID（t_ec_sales_revenue.id） */
    private Long localRevenueId;

    /** 关联本地收入流水号 */
    private String localRevenueNo;

    /** 平台账单金额 */
    private BigDecimal platformAmount;

    /** 本地收入金额 */
    private BigDecimal localAmount;

    /** 差异金额（平台-本地） */
    private BigDecimal diffAmount;

    /** 差异类型：NONE/MISSING_LOCAL/MISSING_PLATFORM/AMOUNT_MISMATCH */
    private String diffType;

    /** AI 差异分析 */
    private String aiAnalysis;

    /** AI 置信度 0-100 */
    private Integer aiConfidence;

    /** 0待处理/1已确认/2已申诉/3已忽略 */
    private Integer handledStatus;

    private String handledBy;
    private LocalDateTime handledTime;

    /** 处理备注 */
    private String handledRemark;

    /** 账单拉取时间 */
    private LocalDateTime fetchedTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
