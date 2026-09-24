package com.fashion.supplychain.warehouse.dto;

import com.fashion.supplychain.warehouse.entity.ComboProduct;
import com.fashion.supplychain.warehouse.entity.ComboProductItem;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

/**
 * D-529：组合商品视图对象 —— 主表 + 子项明细 + 可用库存（套）。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class ComboProductVO extends ComboProduct {

    /** 子商品明细 */
    private List<ComboProductItem> items;

    /** 可用库存（套）= min(子SKU可用库存 / 子SKU单套数量)，子SKU缺失按 0 */
    private Integer availableStock;
}
