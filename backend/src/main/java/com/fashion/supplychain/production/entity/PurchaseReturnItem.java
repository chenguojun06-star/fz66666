package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 采购退货物料明细实体类
 * 对应表: t_purchase_return_item
 */
@Data
@TableName("t_purchase_return_item")
public class PurchaseReturnItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 租户ID（P0铁律4：多租户隔离）
     */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /**
     * 退货单ID
     */
    private Long returnId;

    /**
     * 原采购记录ID（对应MaterialPurchase.id）
     */
    private String purchaseId;

    /**
     * 物料ID
     */
    private String materialId;

    /**
     * 物料编码
     */
    private String materialCode;

    /**
     * 物料名称
     */
    private String materialName;

    /**
     * 物料类型
     */
    private String materialType;

    /**
     * 规格
     */
    private String spec;

    /**
     * 颜色
     */
    private String color;

    /**
     * 尺码
     */
    private String size;

    /**
     * 单位
     */
    private String unit;

    /**
     * 退货数量
     */
    private Integer quantity;

    /**
     * 单价
     */
    private BigDecimal unitPrice;

    /**
     * 金额
     */
    private BigDecimal amount;

    /**
     * 退货原因（明细）
     */
    private String returnReason;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}