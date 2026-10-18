package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** D-816：POS 退货/换货单行。 */
@Data
@TableName("t_pos_return_item")
public class PosReturnItem {

    private String id;
    private Long tenantId;
    private String returnId;
    private String returnNo;
    /** 原销售单行 ID：可退量按它逐行核算，防止退超（与 t_pos_sale_item.id 同为 BIGINT） */
    private Long saleItemId;
    private Long skuId;
    private String skuCode;
    private Long styleId;
    private String styleNo;
    private String styleName;
    private String color;
    private String size;
    private Integer quantity;
    private BigDecimal unitPrice;
    private BigDecimal amount;
    private LocalDateTime createTime;
}
