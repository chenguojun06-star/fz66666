package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import java.util.Map;

public interface MaterialStockService extends IService<MaterialStock> {

    IPage<MaterialStock> queryPage(Map<String, Object> params);

    /**
     * 增加库存 (采购入库)
     */
    void increaseStock(MaterialPurchase purchase, int quantity);

    /**
     * 扣减库存 (生产领料/退货)
     */
    void decreaseStock(MaterialPurchase purchase, int quantity);
    
    /**
     * 扣减库存 (通用)
     */
    void decreaseStock(String materialId, String color, String size, int quantity);

    /**
     * 根据库存ID扣减库存
     */
    void decreaseStockById(String stockId, int quantity);

    /**
     * 根据物料ID列表批量获取库存
     */
    java.util.List<MaterialStock> getStocksByMaterialIds(java.util.List<String> materialIds);
}
