package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleBom;
import java.util.List;
import java.util.Map;

public interface StyleBomService extends IService<StyleBom> {
    /**
     * 根据款号ID查询BOM列表
     */
    List<StyleBom> listByStyleId(Long styleId);

    /**
     * 保存BOM并检查库存
     * 自动计算每个物料的库存状态（充足/不足/无库存）
     *
     * @param bomList BOM明细列表
     * @param productionQty 生产数量
     * @return 保存后的BOM列表（包含库存状态）
     */
    List<StyleBom> saveBomWithStockCheck(List<StyleBom> bomList, Integer productionQty);

    /**
     * 根据物料编码列表批量查询BOM
     */
    List<StyleBom> listByMaterialCodes(java.util.List<String> materialCodes);

    /**
     * 获取BOM库存汇总信息
     *
     * @param styleId 款号ID
     * @param productionQty 生产数量
     * @return 汇总信息（总物料数、库存充足数、需采购数、库存总值等）
     */
    Map<String, Object> getBomStockSummary(Long styleId, Integer productionQty);

    /**
     * 清理指定款号的BOM缓存
     */
    void clearBomCache(Long styleId);
}
