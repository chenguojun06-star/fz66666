package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.ProductSku;

import java.util.List;

public interface ProductSkuService extends IService<ProductSku> {
    void generateSkusForStyle(Long styleId);

    void updateStock(String skuCode, int quantity);

    void updateStockById(Long id, int delta);

    boolean decreaseStockBySkuCode(String skuCode, int delta);

    List<ProductSku> listByStyleId(Long styleId);

    void batchUpdateSkus(Long styleId, List<ProductSku> skuList);

    void updateSkuMode(Long styleId, String skuMode);

    void syncSkusToProduction(Long styleId);
}
