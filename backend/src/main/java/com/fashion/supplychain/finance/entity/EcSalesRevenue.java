package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 电商销售收入流水
 * <p>
 * 对应 t_ec_sales_revenue 表。
 * 触发时机：FinishedInventoryOrchestrator.outbound() → EcommerceOrderOrchestrator.onWarehouseOutbound()
 * 状态流转：pending（出库时自动生成）→ confirmed（财务核账）→ reconciled（已入账）
 */
@Data
@TableName("t_ec_sales_revenue")
public class EcSalesRevenue {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 流水号，格式 EC-yyyyMMdd-xxxxx */
    private String revenueNo;

    /** 关联电商订单 ID */
    private Long ecOrderId;

    /** 内部 EC 单号（如 TB2502010001） */
    private String ecOrderNo;

    /** 平台原始单号 */
    private String platformOrderNo;

    /** 平台代码（TB/JD/PDD/DY/XHS…） */
    private String platform;

    /** 店铺名称 */
    private String shopName;

    /** 商品名称 */
    private String productName;

    /** SKU 码 */
    private String skuCode;

    /** 销售数量 */
    private Integer quantity;

    /** 商品单价 */
    private BigDecimal unitPrice;

    /** 商品总金额 */
    private BigDecimal totalAmount;

    /** 买家实际支付金额（核心收入数字） */
    private BigDecimal payAmount;

    /** 运费 */
    private BigDecimal freight;

    /** 平台优惠折扣 */
    private BigDecimal discount;

    /** 关联生产订单号 */
    private String productionOrderNo;

    /**
     * 状态：
     * pending    - 待确认（出库后自动生成）
     * confirmed  - 财务已核账
     * reconciled - 已入账（对账完成）
     */
    @TableField(value = "status")
    private String status;

    /** 发货时间 */
    private LocalDateTime shipTime;

    /** 买家确认收货时间（由平台回调更新） */
    private LocalDateTime completeTime;

    /** 财务备注 */
    private String remark;

    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
