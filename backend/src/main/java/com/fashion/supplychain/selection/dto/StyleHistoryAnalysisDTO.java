package com.fashion.supplychain.selection.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

/** 历史款式分析返回（内部数据聚合） */
@Data
public class StyleHistoryAnalysisDTO {

    private String styleNo;
    private String styleName;
    private String category;

    /** 历史下单总次数 */
    private Integer orderCount;

    /** 历史下单总件数 */
    private Integer totalOrderQty;

    /** 历史入库合格件数 */
    private Integer totalWarehousedQty;

    /** 平均合格率(%) */
    private BigDecimal avgQualifiedRate;

    /** 平均利润率(%) */
    private BigDecimal avgProfitRate;

    /** 最高利润率 */
    private BigDecimal maxProfitRate;

    /** 总销售收入（含成品结算） */
    private BigDecimal totalRevenue;

    /** 总生产成本 */
    private BigDecimal totalCost;

    /** 首次下单时间 */
    private String firstOrderTime;

    /** 最近下单时间 */
    private String lastOrderTime;

    /** 返单次数（同款多次下单） */
    private Integer repeatOrderCount;

    /** 是否高潜力款（返单≥2且利润＞25%） */
    private Boolean highPotential;

    /** 适合季节分布（JSON） */
    private String seasonDistribution;

    /** 所有关联客户列表 */
    private List<String> customers;
}
