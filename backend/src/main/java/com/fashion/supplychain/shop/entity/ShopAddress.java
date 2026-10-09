package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * D-770：店铺顾客收货地址簿。
 *
 * <p>C 端尚无账号体系，手机号即顾客身份标识（与既有「按手机号查单」一致）。
 */
@Data
@TableName("t_shop_address")
public class ShopAddress {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    /** 顾客手机号（C 端身份标识） */
    @TableField("phone")
    private String phone;

    @TableField("consignee")
    private String consignee;

    @TableField("phone_ext")
    private String phoneExt;

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
