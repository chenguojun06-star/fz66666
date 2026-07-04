package com.fashion.supplychain.crm.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 退货商品明细实体（P0铁律4：多租户隔离）
 */
@Data
@TableName("t_sales_return_item")
public class SalesReturnItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4：多租户隔离） */
    private Long tenantId;

    /** 退货单ID */
    private Long returnId;

    /** 款式ID */
    private String styleId;

    /** 款号 */
    private String styleNo;

    /** 款式名称 */
    private String styleName;

    /** 颜色 */
    private String color;

    /** 尺码 */
    private String size;

    /** 退货数量 */
    private Integer quantity;

    /** 单价 */
    private BigDecimal unitPrice;

    /** 金额 */
    private BigDecimal amount;

    /** 退货原因（明细） */
    private String returnReason;

    /** 创建时间 */
    private LocalDateTime createTime;
}