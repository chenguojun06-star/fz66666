package com.fashion.supplychain.production.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 物料色卡识别结果 DTO
 *
 * 用于：拍照色卡后，AI 自动识别物料信息，返回给前端
 * 每个字段都附置信度和原始文本，便于用户确认/编辑
 */
@Data
public class MaterialColorCardRecognitionResult {

    /** 识别是否成功 */
    private boolean success = false;

    /** 错误信息（success=false 时有效） */
    private String errorMessage;

    /** 原始图片 URL */
    private String imageUrl;

    /** 总体置信度 0-100 */
    private Integer overallConfidence;

    /** AI 提示信息（需要用户关注的警告，如「颜色名称不确定，请核对」） */
    private String aiHint;

    // ==================== 核心字段（每个字段附置信度，便于前端以更清晰展示）

    private FieldValue materialName;        // 物料名称
    private FieldValue materialType;        // 物料类型（fabric/lining/accessory）
    private FieldValue color;            // 颜色
    private FieldValue fabricWidth;       // 幅宽
    private FieldValue fabricWeight;       // 克重
    private FieldValue fabricComposition; // 成分
    private FieldValue specifications;    // 规格
    private FieldValue unit;          // 单位
    private FieldValue supplierName;    // 供应商名称
    private FieldValue unitPrice;       // 单价
    private FieldValue styleNo;         // 款号
    private FieldValue description;     // 描述/备注

    /** 单字段识别结果 */
    @Data
    public static class FieldValue {
        /** 识别后的文本值 */
        private String textValue;
        /** 数值值（如果是数值字段） */
        private BigDecimal numberValue;
        /** 置信度 0-100 */
        private Integer confidence;
        /** 原始识别的原文 */
        private String rawText;

        public static FieldValue ofText(String textValue, Integer confidence, String rawText) {
            FieldValue fv = new FieldValue();
            fv.setTextValue(textValue);
            fv.setConfidence(confidence);
            fv.setRawText(rawText);
            return fv;
        }

        public static FieldValue ofNumber(BigDecimal numberValue, Integer confidence, String rawText) {
            FieldValue fv = new FieldValue();
            fv.setNumberValue(numberValue);
            fv.setConfidence(confidence);
            fv.setRawText(rawText);
            return fv;
        }
    }
}
