package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.ProductSku;

public interface ProductSkuService extends IService<ProductSku> {
    /**
     * 根据款号生成或更新SKU
     * 
     * @param styleId 款式ID
     */
    void generateSkusForStyle(Long styleId);

    /**
     * 更新库存
     * 
     * @param skuCode  SKU编码
     * @param quantity 变更数量 (正数增加，负数减少)
     */
    void updateStock(String skuCode, int quantity);
}
