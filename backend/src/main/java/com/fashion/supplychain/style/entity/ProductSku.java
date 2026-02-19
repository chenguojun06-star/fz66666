package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 商品SKU实体类
 * 用于连接内部生产款式与外部电商商品
 */
@Data
@TableName("t_product_sku")
public class ProductSku {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * SKU编码 (规则: 款号-颜色-尺码)
     */
    private String skuCode;

    /**
     * 关联款号ID
     */
    private Long styleId;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 颜色
     */
    private String color;

    /**
     * 尺码
     */
    private String size;

    /**
     * 条形码/69码
     */
    private String barcode;

    /**
     * 外部电商平台SKU ID
     */
    private String externalSkuId;

    /**
     * 外部平台标识 (如: taobao, shopify)
     */
    private String externalPlatform;

    /**
     * 成本价
     */
    private BigDecimal costPrice;

    /**
     * 销售价
     */
    private BigDecimal salesPrice;

    /**
     * 库存数量
     */
    private Integer stockQuantity;

    /**
     * 状态: ENABLED-启用, DISABLED-禁用
     */
    private String status;

    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
