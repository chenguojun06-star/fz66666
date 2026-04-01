package com.fashion.supplychain.production.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * AI质检建议响应 DTO
 * 提供订单质检要点、按异常类别的AI建议、历史次品率预警
 */
@Data
@Builder
public class QualityAiSuggestionResponse {

    /** 订单号 */
    private String orderNo;
    /** 款号 */
    private String styleNo;
    /** 款名 */
    private String styleName;
    /** 品类 */
    private String productCategory;
    /** 是否急单 */
    private boolean urgent;

    /** 历史次品率（0~1），null表示无历史数据 */
    private Double historicalDefectRate;
    /** 历史次品率风险等级：good / warn / critical */
    private String historicalVerdict;

    /**
     * 通用质检要点列表（5~8条，按品类生成）
     * 例如：["检查领口缝线是否平整", "检查扣子/钮扣牢固度", ...]
     */
    private List<String> checkpoints;

    /**
     * 按异常类别的AI建议
     * key = defectCategory 值（appearance_integrity / size_accuracy / ...）
     * value = 建议文本（可直接采纳至备注）
     */
    private Map<String, String> defectSuggestions;

    /** 急单紧急提示（null表示无） */
    private String urgentTip;
}
