package com.fashion.supplychain.warehouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * D-529：组合商品（套装）主表。
 * 把任意两个及以上不同款式的 SKU 组合成一个"组合SKU"用于上架/销售；
 * 组合SKU本身不占库存，可用库存 = min(子SKU可用库存 / 子SKU数量)。
 */
@Data
@TableName("t_combo_product")
@EqualsAndHashCode(callSuper = false)
public class ComboProduct {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 组合商品编码（租户内唯一） */
    private String comboCode;

    /** 组合商品名称 */
    private String comboName;

    /** 组合款式编码（简码） */
    private String shortCode;

    /** 颜色及规格（套装描述，如"黑色/L + 白色/M"） */
    private String colorSizeDesc;

    /** 商品分类 */
    private String category;

    /** 商品标签 */
    private String tags;

    /** 组合基本售价（NULL=按子SKU售价） */
    private BigDecimal salePrice;

    /** 组合成本价 */
    private BigDecimal costPrice;

    /** 售价自动计算（按子SKU售价×数量求和） */
    private Integer autoSalePrice;

    /** 成本自动计算 */
    private Integer autoCostPrice;

    /** 组合图片 */
    private String coverUrl;

    /** 备注 */
    private String remark;

    /** ENABLED=启用, DISABLED=停用 */
    private String status;

    /** 创建人 */
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
