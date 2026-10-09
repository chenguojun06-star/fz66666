package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 平台级 C 端购物车项（P1）。
 *
 * <p>挂在**平台消费者**下（consumerId），一辆车里可以同时放不同店铺的商品 ——
 * 这是「平台商城」与「每租户一个小店」在购物车层面的分界。
 *
 * <p>{@code tenantId} 是冗余列，仅作**结算分组键**：结算时按店铺逐张下单，
 * 因此一张订单仍然只含一个店铺（资金与货权不跨店）。
 *
 * <p>{@code (consumerId, skuId)} 唯一：重复加购累加数量，而不是插两条。
 */
@Data
@TableName("t_shop_cart_item")
public class ShopCartItem {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    @TableField("consumer_id")
    private String consumerId;

    /** 商品所属店铺租户（结算分组键） */
    @TableField("tenant_id")
    private Long tenantId;

    @TableField("sku_id")
    private Long skuId;

    @TableField("quantity")
    private Integer quantity;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
