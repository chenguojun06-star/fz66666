package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 物料采购实体类
 */
@Data
@TableName("t_material_purchase")
public class MaterialPurchase {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String purchaseNo;

    private String materialId;

    private String materialCode;

    private String materialName;

    private String materialType;

    private String specifications;

    private String unit;

    private Integer purchaseQuantity;

    private Integer arrivedQuantity;

    /**
     * 入库记录ID（关联最新入库单）
     */
    private String inboundRecordId;

    private String supplierId;

    private String supplierName;

    /**
     * 供应商联系人
     */
    private String supplierContactPerson;

    /**
     * 供应商联系电话
     */
    private String supplierContactPhone;

    private BigDecimal unitPrice;

    private BigDecimal totalAmount;

    private String receiverId;

    private String receiverName;

    private LocalDateTime receivedTime;

    private String remark;

    private String orderId;

    private String orderNo;

    private String styleId;

    private String styleNo;

    private String styleName;

    private String styleCover;

    /**
     * 颜色（从样衣同步）
     */
    private String color;

    /**
     * 尺码（从样衣同步）
     */
    private String size;

    private Integer returnConfirmed;

    private Integer returnQuantity;

    private String returnConfirmerId;

    private String returnConfirmerName;

    private LocalDateTime returnConfirmTime;

    private String status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    // ==================== 操作人字段（自动填充）====================

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterId;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterName;

    // ==================== 到货日期字段（新增）====================

    /**
     * 预计到货日期
     */
    private LocalDateTime expectedArrivalDate;

    /**
     * 实际到货日期
     */
    private LocalDateTime actualArrivalDate;

    /**
     * 预计出货日期
     */
    private java.time.LocalDate expectedShipDate;

    // ==================== 采购来源字段（区分样衣/订单/批量采购）====================

    /**
     * 采购来源类型: order=生产订单, sample=样衣开发, batch=批量采购, stock=安全库存补货
     */
    private String sourceType;

    /**
     * 样衣生产ID（样衣采购时关联）
     */
    private String patternProductionId;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
