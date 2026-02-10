package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 应用商店实体
 */
@Data
@TableName("t_app_store")
public class AppStore {

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 应用编码：PRODUCTION/STYLE/FINANCE/WAREHOUSE/REPORT
     */
    private String appCode;

    /**
     * 应用名称
     */
    private String appName;

    /**
     * 应用图标URL或Emoji
     */
    private String appIcon;

    /**
     * 应用简介
     */
    private String appDesc;

    /**
     * 应用详细说明（富文本）
     */
    private String appDetail;

    /**
     * 应用分类：核心应用/增值服务/数据分析
     */
    private String category;

    /**
     * 计费类型：FREE/MONTHLY/YEARLY/ONCE
     */
    private String priceType;

    /**
     * 月付价格
     */
    private BigDecimal priceMonthly;

    /**
     * 年付价格
     */
    private BigDecimal priceYearly;

    /**
     * 买断价格
     */
    private BigDecimal priceOnce;

    /**
     * 排序序号
     */
    private Integer sortOrder;

    /**
     * 是否热门应用
     */
    private Boolean isHot;

    /**
     * 是否新应用
     */
    private Boolean isNew;

    /**
     * 状态：DRAFT/PUBLISHED/OFFLINE
     */
    private String status;

    /**
     * 功能列表JSON
     */
    private String features;

    /**
     * 应用截图JSON
     */
    private String screenshots;

    /**
     * 最少用户数
     */
    private Integer minUsers;

    /**
     * 最大用户数
     */
    private Integer maxUsers;

    /**
     * 试用天数
     */
    private Integer trialDays;

    /**
     * 备注
     */
    private String remark;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;

    /**
     * 功能列表（自动解析features JSON）
     */
    @TableField(exist = false)
    private List<String> featureList;

    /**
     * 截图列表（自动解析screenshots JSON）
     */
    @TableField(exist = false)
    private List<String> screenshotList;
}
