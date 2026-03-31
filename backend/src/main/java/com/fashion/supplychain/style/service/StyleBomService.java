package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleBom;
import java.util.List;

public interface StyleBomService extends IService<StyleBom> {
    /**
     * 根据款号ID查询BOM列表
     */
    List<StyleBom> listByStyleId(Long styleId);

    /**
     * 根据物料编码列表批量查询BOM
     */
    List<StyleBom> listByMaterialCodes(java.util.List<String> materialCodes);

    /**
     * 清理指定款号的BOM缓存
     */
    void clearBomCache(Long styleId);
}
