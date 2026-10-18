package com.fashion.supplychain.ticket.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 小票明细行（聚合自源单据明细，款式图按 skuId/skuCode 批量回查，不落库）。
 */
@Data
public class TicketItemData {

    private Long skuId;

    private String skuCode;

    /** 款式ID（出库单场景直接带，款式图兜底用） */
    private String styleId;

    private String styleNo;

    private String styleName;

    private String color;

    private String size;

    /** 成交单价（绝不输出成本价/吊牌内部口径） */
    private BigDecimal unitPrice;

    private Integer quantity;

    private BigDecimal amount;

    /** 款式图（SKU 颜色图优先，缺失回退款式封面，可为空） */
    private String imageUrl;
}
