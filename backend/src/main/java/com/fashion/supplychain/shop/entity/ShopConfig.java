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

    /* ── D-769：服务承诺（商家显式开关，不做空头承诺）── */

    /** 无理由退货天数；0 = 不承诺。开启时前端必须要求填写天数 */
    private Integer returnDays;

    /** 现货速发承诺开关；0 = 不承诺 */
    private Integer promiseInStock;

    /** 正品保障承诺开关；0 = 不承诺 */
    private Integer promiseAuthentic;

    /** 其它服务承诺（逗号分隔的自由文本），为空则不展示 */
    private String promiseExtra;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
