package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 款号BOM表实体类
 */
@Data
@TableName("t_style_bom")
public class StyleBom {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 关联款号ID
     */
    private Long styleId;

    /**
     * 物料编码
     */
    private String materialCode;

    /**
     * 物料名称
     */
    private String materialName;

    private String materialType;

    /**
     * 颜色
     */
    private String color;

    private String specification;

    /**
     * 尺码/规格
     */
    private String size;

    /**
     * 单位
     */
    private String unit;

    /**
     * 单件用量
     */
    private BigDecimal usageAmount;

    /**
     * 损耗率(%)
     */
    private BigDecimal lossRate;

    private BigDecimal unitPrice;

    private BigDecimal totalPrice;

    /**
     * 供应商（旧字段，兼容保留）
     */
    private String supplier;

    /**
     * 供应商ID（关联t_factory表）
     */
    private String supplierId;

    /**
     * 供应商联系人
     */
    private String supplierContactPerson;

    /**
     * 供应商联系电话
     */
    private String supplierContactPhone;

    /**
     * 备注
     */
    private String remark;

    /**
     * 库存状态：sufficient=充足, insufficient=不足, none=无库存, unchecked=未检查
     */
    private String stockStatus;

    /**
     * 可用库存数量（quantity - locked_quantity）
     */
    private Integer availableStock;

    /**
     * 需采购数量（需求量 - 可用库存，最小为0）
     */
    private Integer requiredPurchase;

    /**
     * 领取人
     */
    private String assignee;

    /**
     * 开始时间
     */
    private LocalDateTime startTime;

    /**
     * 完成时间
     */
    private LocalDateTime completedTime;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
