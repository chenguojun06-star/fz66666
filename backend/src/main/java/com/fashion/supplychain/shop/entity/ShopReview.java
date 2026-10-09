package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * C 端商品评价（P2）。
 *
 * <p>粒度是**一单一款一条**（{@code order_id + style_no} 唯一）：
 * 评价必须落到商品上，否则商品页答不了「这款好不好」。
 *
 * <p>只允许「已发货」订单评价，且提交后不可修改 —— 防刷分，也让商家有稳定口碑。
 */
@Data
@TableName("t_shop_review")
public class ShopReview {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    @TableField("order_id")
    private String orderId;

    @TableField("order_no")
    private String orderNo;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("consumer_id")
    private String consumerId;

    @TableField("style_id")
    private Long styleId;

    @TableField("style_no")
    private String styleNo;

    @TableField("sku_id")
    private Long skuId;

    /** 1~5 星 */
    @TableField("rating")
    private Integer rating;

    @TableField("content")
    private String content;

    /** 1=匿名展示 */
    @TableField("anonymous")
    private Integer anonymous;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
