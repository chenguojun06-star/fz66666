package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 店铺经营日报计数器（浏览 / 加购）。
 *
 * <p>只存「无法从既有事实表还原」的原始计数：订单数与成交金额实时查
 * {@code t_shop_order}，购物车行结算后会被删除、浏览日志按顾客+款式合并，
 * 这两项事后都算不出来，所以必须落独立计数器。
 */
@Data
@TableName("t_shop_stat_daily")
public class ShopStatDaily {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 统计日期（服务器本地日期） */
    private LocalDate statDate;

    /** 商品详情浏览次数（含匿名访客） */
    private Integer browseCount;

    /** 加入购物车次数 */
    private Integer cartAddCount;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
