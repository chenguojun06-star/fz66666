package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

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

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
