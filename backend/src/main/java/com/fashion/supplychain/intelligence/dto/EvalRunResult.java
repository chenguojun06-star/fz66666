package com.fashion.supplychain.intelligence.dto;

import java.util.Map;
import lombok.Builder;
import lombok.Data;

/**
 * 离线评估运行结果（P1-4）
 *
 * <p>由 {@code OfflineEvalService.runEvaluation} 返回，汇总一次批量评估的统计信息。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Data
@Builder
public class EvalRunResult {

    /** 数据集ID */
    private Long datasetId;

    /** 数据集总项数 */
    private Integer totalItems;

    /** 本次已评估项数 */
    private Integer evaluated;

    /** 平均得分0-100 */
    private Double avgScore;

    /** 多维度平均得分 */
    private Map<String, Double> dimensionScores;
}
