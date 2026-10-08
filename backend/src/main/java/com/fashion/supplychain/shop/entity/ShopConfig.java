package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * C端店铺配置（D-763）：每租户一个 slug 门面。
 */
@Data
@TableName("t_shop_config")
public class ShopConfig {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;

    /** 店铺访问标识（URL 用，全局唯一） */
    private String slug;

    private String shopName;

    private String notice;

    /** 1=营业中 0=已打烊（打烊拒绝下单，浏览不受影响） */
    private Integer enabled;

    /** 是否收取运费：1 收取（按规则） / 0 全场包邮 */
    private Integer shippingEnabled;

    /** 默认运费（未达包邮门槛时收取） */
    private BigDecimal shippingFee;

    /** 满额包邮门槛：商品金额达到该值即包邮；0 表示无门槛（即不包邮） */
    private BigDecimal freeShippingThreshold;

    /** 配送说明（买家可见，如「偏远地区需补运费，客服会联系您」） */
    private String shippingNote;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
