package com.fashion.supplychain.production.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 款式成本明细DTO - 用于侧滑弹窗显示每款成本明细
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StyleCostDetailDTO {

    /**
     * 款式ID
     */
    private String styleId;

    /**
     * 款式编号
     */
    private String styleNo;

    /**
     * 款式名称
     */
    private String styleName;

    /**
     * 款式图片URL
     */
    private String styleImage;

    /**
     * 样衣数量
     */
    private Integer patternCount;

    /**
     * 开发时间（如 "3天5小时"）
     */
    private String developmentTime;

    /**
     * 开发时间（秒），用于前端计算平均时间
     */
    private Long developmentTimeSeconds;

    /**
     * 面辅料费用
     */
    private BigDecimal materialCost;

    /**
     * 工序费用
     */
    private BigDecimal processCost;

    /**
     * 二次工艺费用
     */
    private BigDecimal secondaryProcessCost;

    /**
     * 总费用
     */
    private BigDecimal totalCost;
}
