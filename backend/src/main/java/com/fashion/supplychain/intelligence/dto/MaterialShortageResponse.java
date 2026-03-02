package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;

/**
 * 面料缺口预测响应 DTO
 */
@Data
public class MaterialShortageResponse {

    /** 有缺口的物料列表（按缺口量降序） */
    private List<ShortageItem> shortageItems;

    /** 充足的物料条数 */
    private int sufficientCount;

    /** 本次预测覆盖的在产订单数 */
    private int coveredOrderCount;

    /** 预测说明 */
    private String summary;

    @Data
    public static class ShortageItem {
        /** 物料编码 */
        private String materialCode;
        /** 物料名称 */
        private String materialName;
        /** 单位 */
        private String unit;
        /** 颜色/规格 */
        private String spec;
        /** 当前库存 */
        private int currentStock;
        /** 在产订单需求量（BOM × 订单量 求和） */
        private int demandQuantity;
        /** 缺口量（需求 - 库存），>0 表示不足 */
        private int shortageQuantity;
        /** 风险等级：HIGH / MEDIUM / LOW */
        private String riskLevel;
        /** 供应商名称 */
        private String supplierName;
        /** 供应商联系人 */
        private String supplierContact;
        /** 供应商电话 */
        private String supplierPhone;
    }
}
