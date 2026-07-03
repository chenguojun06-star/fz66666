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

    void updateUseSkuPrefix(Long styleId, Integer useSkuPrefix);

    ProductSku getBySkuCode(String skuCode);

    List<ProductSku> listByTenantId(Long tenantId);

    /**
     * 根据款号和颜色获取SKU颜色图片
     * @param styleNo 款号
     * @param color 颜色
     * @return 颜色图片URL，如果没有则返回null
     */
    String getSkuColorImage(String styleNo, String color);

    /**
     * 根据款号获取该款所有颜色的图片映射
     * @param styleNo 款号
     * @return Map<颜色, 图片URL>
     */
    java.util.Map<String, String> getStyleColorImages(String styleNo);

    /**
     * 加权平均法更新成本价（库存由其他逻辑更新）
     * @param skuCode SKU编码
     * @param inboundQty 入库数量
     * @param inboundUnitPrice 入库单价
     */
    void updateCostPrice(String skuCode, int inboundQty, java.math.BigDecimal inboundUnitPrice);
}
