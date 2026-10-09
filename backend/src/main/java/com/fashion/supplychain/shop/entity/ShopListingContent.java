package com.fashion.supplychain.shop.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 店铺商品「详情内容」（D-782）
 *
 * <p>上架编辑页此前只有「单张主图 + 每色一张图」，运营想编辑轮播图、视频、
 * 品牌、尺码表、卖点、常见问题、价格说明时**根本没有入口**。
 * 本表一次性把这些补齐，全部按款式存一份。
 *
 * <p>列表类内容（轮播图/卖点/常见问题）在实体层保持 JSON 原文，
 * 由编排器统一解析成结构 —— 与 ShopOrderOrchestrator 里成分明细的处理方式一致，
 * 避免 JSON 解析散落到各处。
 */
@Data
@TableName("t_shop_listing_content")
public class ShopListingContent {

    @TableId
    private Long id;

    private Long tenantId;

    private Long styleId;

    /** 轮播图 URL 数组（JSON 字符串），已按顺序排列，第 1 张即主图 */
    private String galleryJson;

    private String videoUrl;

    private String brand;

    /** 手工尺码表（富文本 HTML）；为空则由 SKU 自动生成 */
    private String sizeChart;

    /** 核心卖点（JSON 字符串数组） */
    private String pointsJson;

    /** 常见问题（JSON 对象数组 [{q,a}]） */
    private String faqJson;

    /** 价格说明 */
    private String priceNote;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}