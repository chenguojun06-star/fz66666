package com.fashion.supplychain.dashboard.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 延期环节统计响应DTO
 * 按样衣开发/大货生产分类，每个分类下按环节分组
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DelayedStageBreakdownResponse {

    /**
     * 样衣开发延期统计（按环节分组）
     */
    private List<DelayedStageGroup> sampleDelayed;

    /**
     * 大货生产延期统计（按环节分组）
     */
    private List<DelayedStageGroup> bulkDelayed;

    /**
     * 样衣开发延期总数
     */
    private Integer sampleTotal;

    /**
     * 大货生产延期总数
     */
    private Integer bulkTotal;
}
