package com.fashion.supplychain.selection.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 趋势数据快照实体
 */
@Data
@TableName("t_trend_snapshot")
public class TrendSnapshot {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 快照日期 */
    private LocalDate snapshotDate;

    /**
     * 数据来源:
     * INTERNAL-内部历史数据 / BAIDU-百度指数 / GOOGLE-谷歌趋势 /
     * WEIBO-微博热搜 / MANUAL-手动录入
     */
    private String dataSource;

    /**
     * 趋势类型:
     * COLOR-颜色 / SILHOUETTE-廓形 / FABRIC-面料 /
     * CATEGORY-品类 / KEYWORD-关键词
     */
    private String trendType;

    /** 趋势关键词 */
    private String keyword;

    /** 热度分(0-100) */
    private Integer heatScore;

    /** 原始趋势数据（JSON） */
    private String trendData;

    /** 关联关键词列表（JSON） */
    private String keywordsJson;

    /** AI生成的中文趋势摘要 */
    private String aiSummary;

    /** AI给出的选品建议 */
    private String aiSuggestion;

    /** 时间周期: day/week/month */
    private String period;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
