package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 平台级 C 端收货地址簿（P0）。
 *
 * <p>与 {@code t_shop_address}（租户 + 手机号维度）并存：那张表服务**免登录**下单链路，
 * 这张表服务**已登录平台账号**的顾客 —— 一条地址在所有店铺下单时都能复用。
 */
@Data
@TableName("t_shop_consumer_address")
public class ShopConsumerAddress {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    @TableField("consumer_id")
    private String consumerId;

    @TableField("consignee")
    private String consignee;

    @TableField("phone")
    private String phone;

    @TableField("province")
    private String province;

    @TableField("city")
    private String city;

    @TableField("district")
    private String district;

    @TableField("detail_addr")
    private String detailAddr;

    @TableField("is_default")
    private Integer isDefault;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
