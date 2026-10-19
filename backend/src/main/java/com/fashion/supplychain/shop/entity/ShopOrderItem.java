package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

/**
 * C端店铺订单明细（D-763）。
 */
@Data
@TableName("t_shop_order_item")
public class ShopOrderItem {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String orderId;

    private Long tenantId;

    private Long skuId;

    /**
     * 款式ID（t_style_info.id）。
     *
     * <p><b>统计一律按这个列关联</b>，不要再按 {@code styleNo}：
     * 款号是可编辑的业务字段，改一次号历史销量就断链，且全程无报错。
     */
    private Long styleId;
    private String skuCode;
    private String styleNo;
    private String styleName;
    private String color;
    private String size;

    /** 成交单价（服务端取 SKU 售价，不信前端） */
    private BigDecimal unitPrice;

    private Integer quantity;

    private BigDecimal amount;
}
