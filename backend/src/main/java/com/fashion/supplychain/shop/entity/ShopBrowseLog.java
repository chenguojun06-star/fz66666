package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 顾客浏览行为（D-784）
 *
 * <p>推荐要「结合用户历史」，前提是先有浏览行为可依 —— 此前系统一条都没记，
 * 只能做「谁看这件都推一样的」弱推荐。
 *
 * <p>按「租户 + 顾客 + 款式」合并计数而非每次浏览插一行：详情页刷新、返回再进
 * 都很常见，逐条插入会让热度假象严重失真。
 */
@Data
@TableName("t_shop_browse_log")
public class ShopBrowseLog {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private Long tenantId;

    private String consumerId;

    private Long styleId;

    private String styleNo;

    /** 浏览次数 */
    private Integer viewCount;

    private LocalDateTime firstTime;

    private LocalDateTime lastTime;
}