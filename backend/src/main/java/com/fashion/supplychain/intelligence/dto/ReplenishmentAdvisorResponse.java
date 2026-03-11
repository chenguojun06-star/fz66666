package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

import java.util.List;

/**
 * B8 - 补料建议响应 DTO
 */
@Data
public class ReplenishmentAdvisorResponse {

    /** 检测到的缺料条目数 */
    private int shortageCount;

    /** 紧急（urgent）条目数 */
    private int urgentCount;

    /** 补料建议列表（按紧迫度降序） */
    private List<ReplenishmentItem> items;

    @Data
    public static class ReplenishmentItem {
        /** 物料编码 */
        private String materialCode;

        /** 物料名称 */
        private String materialName;

        /** 规格 */
        private String spec;

        /** 单位 */
        private String unit;

        /** 当前库存 */
        private int currentStock;

        /** 需求数量 */
        private int demandQuantity;

        /** 缺口数量 */
        private int shortageQuantity;

        /** 紧迫级别：urgent / warning / watch */
        private String urgencyLevel;

        /** 建议供应商名称 */
        private String recommendedSupplier;

        /** 供应商联系方式 */
        private String supplierContact;

        /** 供应商电话 */
        private String supplierPhone;

        /** 缺口覆盖的订单数 */
        private int affectedOrders;

        /** AI 建议文案 */
        private String advice;

        /** 综合紧迫评分（越高越优先） */
        private double urgencyScore;
    }
}
