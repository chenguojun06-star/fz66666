package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 电商平台订单实体
 * 对应 t_ecommerce_order 表
 */
@Data
@TableName("t_ecommerce_order")
public class EcommerceOrder {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String orderNo;
    private String platform;          // TB/JD/PDD/DY
    private String sourcePlatformCode;// 与 AppStore ECOMMERCE_PLATFORMS.code 一致
    private String platformOrderNo;
    private String shopName;
    private String buyerNick;

    /** 状态: 0-待付款 1-待发货 2-已发货 3-已完成 4-已取消 5-退款中 */
    private Integer status;

    /** 仓库状态: 0-待拣货 1-备货中 2-已出库 */
    private Integer warehouseStatus;

    private BigDecimal unitPrice;     // 商品单价（元/件），区别于 totalAmount
    private BigDecimal totalAmount;
    private BigDecimal payAmount;
    private BigDecimal freight;
    private BigDecimal discount;
    private String payType;

    private LocalDateTime payTime;
    private LocalDateTime shipTime;
    private LocalDateTime completeTime;

    private String receiverName;
    private String receiverPhone;
    private String receiverAddress;

    private String trackingNo;
    private String expressCompany;

    private String buyerRemark;
    private String sellerRemark;

    private String productName;
    private String skuCode;
    private Integer quantity;

    // ==================== 组合套装（D-532）====================

    /**
     * 组合商品ID——平台侧组合商品的商品编码 = t_combo_product.combo_code，
     * 接单识别后回填；现货直发时按子SKU逐个扣库存出库
     */
    private Long comboId;

    /** 组合商品编码（=订单 skuCode 字段值，冗余落库便于列表直显） */
    private String comboCode;

    /** 关联生产订单 */
    private String productionOrderId;
    private String productionOrderNo;

    /** 是否预售订单：0否1是（Phase 2 订单深加工） */
    private Integer isPresale;

    /** 预售说明（到货时间等） */
    private String presaleRemark;

    /** 订单类型：EC/B2B（Phase 4 分销/B2B） */
    private String orderType;

    /** 分销商ID（B2B订单必填） */
    private Long distributorId;

    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
