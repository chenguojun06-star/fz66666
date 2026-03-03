package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

/**
 * 工序单价 AI 提示响应 DTO
 * <p>
 * 当用户在工序表格中输入工序名称或编辑单价时，
 * 后端根据历史数据返回参考价格区间与建议定价。
 */
@Data
public class ProcessPriceHintResponse {

    /** 工序名称（原样返回） */
    private String processName;

    /** 该工序在历史中出现的款式数量 */
    private int usageCount;

    /** 最近一次使用的单价 */
    private BigDecimal lastPrice;

    /** 历史平均单价 */
    private BigDecimal avgPrice;

    /** 历史最低单价 */
    private BigDecimal minPrice;

    /** 历史最高单价 */
    private BigDecimal maxPrice;

    /** AI 建议单价（取加权均值，偏向最近的记录） */
    private BigDecimal suggestedPrice;

    /** 建议理由（一句话说明） */
    private String reasoning;

    /** 最近 5 条同名工序使用记录（供参考） */
    private List<RecentRecord> recentRecords;

    @Data
    public static class RecentRecord {
        /** 款号 */
        private String styleNo;
        /** 单价 */
        private BigDecimal price;
        /** 机器类型（可能为空） */
        private String machineType;
        /** 标准工时（秒） */
        private Integer standardTime;
    }
}
