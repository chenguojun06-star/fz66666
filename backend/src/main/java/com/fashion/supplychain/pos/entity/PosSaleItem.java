package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 收银台销售单明细。
 *
 * <p>冗余存款号/款名/颜色/尺码：这些是**成交当时的快照**，
 * 之后款式改名或 SKU 被删，小票与对账仍要能还原当时卖了什么。
 */
@Data
@TableName("t_pos_sale_item")
public class PosSaleItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long saleId;

    private Long skuId;

    private String skuCode;

    private String styleNo;

    private String styleName;

    private String color;

    private String size;

    /** 吊牌价（展示与对账用） */
    private BigDecimal tagPrice;

    /** 成交单价（可改价，留痕） */
    private BigDecimal unitPrice;

    private Integer quantity;

    /** 小计 = 单价 × 数量 */
    private BigDecimal amount;

    private LocalDateTime createTime;
}
