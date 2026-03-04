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

    /** 关联生产订单 */
    private String productionOrderId;
    private String productionOrderNo;

    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
