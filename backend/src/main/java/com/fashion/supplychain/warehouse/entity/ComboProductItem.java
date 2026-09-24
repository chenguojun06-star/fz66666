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

import java.time.LocalDateTime;

/**
 * D-529：组合商品子项明细。
 * style/sku 字段是落库快照（服务端从 t_product_sku 权威回填，不信任前端提交），
 * 子SKU出库、组合详情展示都以快照为准，商品资料改名不影响历史组合溯源。
 */
@Data
@TableName("t_combo_product_item")
@EqualsAndHashCode(callSuper = false)
public class ComboProductItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 组合商品ID（t_combo_product.id） */
    private Long comboId;

    /** 子商品SKU ID（t_product_sku.id） */
    private Long skuId;

    private Long styleId;

    /** 款号快照 */
    private String styleNo;

    /** 款名快照 */
    private String styleName;

    /** 商品编码快照 */
    private String skuCode;

    private String color;

    private String size;

    /** 单套数量 */
    private Integer quantity;

    /** 排序 */
    private Integer sort;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    // ==================== 非落库展示字段（VO enrich 时从 t_product_sku 现查回填）====================

    /** 子SKU当前可用库存 */
    @TableField(exist = false)
    private Integer availableQty;

    /** 子SKU当前销售单价 */
    @TableField(exist = false)
    private java.math.BigDecimal salesPrice;

    /** 子SKU当前成本单价 */
    @TableField(exist = false)
    private java.math.BigDecimal costPrice;

    /** 子SKU款式图 */
    @TableField(exist = false)
    private String styleImage;
}
