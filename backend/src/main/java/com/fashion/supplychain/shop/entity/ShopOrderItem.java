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
