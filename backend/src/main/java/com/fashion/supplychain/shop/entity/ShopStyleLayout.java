package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * D-770：店铺商品详情页「模块布局」。
 *
 * <p>一条记录 = 一个模块在该款式详情页的启用状态与排序位置。
 * 商家可勾选启用哪些模块、并调整上到下顺序；
 * 没有布局配置的款式渲染时用默认顺序，不预置数据行。
 */
@Data
@TableName("t_shop_style_layout")
public class ShopStyleLayout {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("style_id")
    private Long styleId;

    /** 模块标识：gallery/price/title/promise/color/size/params/detail/wash/quantity/purchase */
    @TableField("module_key")
    private String moduleKey;

    /** 排序号，越小越靠上 */
    @TableField("sort_order")
    private Integer sortOrder;

    /** 1=启用 0=隐藏 */
    @TableField("enabled")
    private Integer enabled;

    /** 模块标题覆盖，为空用默认文案 */
    @TableField("module_title")
    private String moduleTitle;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}