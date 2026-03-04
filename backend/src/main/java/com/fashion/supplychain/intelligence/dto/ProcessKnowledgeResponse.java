package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

/**
 * 工序知识库响应 DTO
 *
 * <p>汇聚同租户所有款式的历史工序数据，按工序名分组统计，
 * 形成可供 AI 学习与定价参考的工序知识库。
 */
@Data
public class ProcessKnowledgeResponse {

    /** 汇总条目列表，一个工序名对应一条 */
    private List<ProcessKnowledgeItem> items;

    /** 工序总种类数 */
    private int totalProcessTypes;

    /** 数据来源款式总数 */
    private int totalStyles;

    /** 总工序记录数 */
    private int totalRecords;

    @Data
    public static class ProcessKnowledgeItem {

        /** 工序名称（分组 key） */
        private String processName;

        /** 所属进度节点（采购/裁剪/车缝/尾部/入库） */
        private String progressStage;

        /** 机器类型（出现次数最多的那个） */
        private String machineType;

        /** 被多少个款引用过 */
        private int usageCount;

        /** 历史最低单价 */
        private BigDecimal minPrice;

        /** 历史最高单价 */
        private BigDecimal maxPrice;

        /** 历史均价 */
        private BigDecimal avgPrice;

        /** AI 加权建议价（最近 3 条权重 ×2） */
        private BigDecimal suggestedPrice;

        /** 平均标准工时（秒） */
        private Integer avgStandardTime;

        /** 最近使用时间（最新创建记录的 createTime） */
        private String lastUsedTime;

        /** 价格趋势：UP / DOWN / STABLE（与最早记录对比） */
        private String priceTrend;

        /** 最近 5 个款的明细（供展开查看） */
        private List<StylePriceRecord> recentStyles;
    }

    @Data
    public static class StylePriceRecord {

        /** 款号 */
        private String styleNo;

        /** 单价 */
        private BigDecimal price;

        /** 机器类型 */
        private String machineType;

        /** 标准工时（秒） */
        private Integer standardTime;

        /** 创建时间（格式化后） */
        private String createTime;
    }
}
