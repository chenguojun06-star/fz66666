package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 工序模板（AI补全）响应
 */
@Data
public class ProcessTemplateResponse {
    /** 匹配的品类（原样回传） */
    private String category;
    /** 参考款式数量 */
    private int sampleStyleCount;
    /** 推荐工序列表（按频率降序） */
    private List<ProcessTemplateItem> processes;
    /** 数据来源：ie_standard=IE标准库+AI, ai_derived=纯AI推演, historical=历史真实数据 */
    private String dataSource;
    /** 匹配方式：category_difficulty=品类+难度, category_only=仅品类, all=全部 */
    private String matchType;
    /** 难度级别标签（如：简单款/工艺复杂） */
    private String difficultyLabel;
    /** 按父节点分组的工序列表（前端展示用） */
    private List<ProcessTemplateGroup> groupedProcesses;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProcessTemplateGroup {
        /** 父节点名称（如：裁剪/车缝/尾部） */
        private String parentNode;
        /** 该父节点下的工序 */
        private List<ProcessTemplateItem> items;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProcessTemplateItem {
        /** 工序名称 */
        private String processName;
        /** 进度节点（如：裁剪/车缝/尾部） */
        private String progressStage;
        /** 在同类款式中出现次数 */
        private int frequency;
        /** 历史平均单价 */
        private double avgPrice;
        /** 历史平均标准工时（秒） */
        private double avgStandardTime;
        /** 建议单价（同均价，便于前端一键采用） */
        private double suggestedPrice;
    }
}
