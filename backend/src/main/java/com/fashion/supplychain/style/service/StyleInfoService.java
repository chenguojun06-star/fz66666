package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.baomidou.mybatisplus.core.metadata.IPage;
import java.util.Map;

/**
 * 款号资料Service接口
 */
public interface StyleInfoService extends IService<StyleInfo> {
    
    /**
     * 分页查询款号资料
     */
    IPage<StyleInfo> queryPage(Map<String, Object> params);
    
    /**
     * 根据ID查询款号资料详情
     */
    StyleInfo getDetailById(Long id);
    
    /**
     * 保存或更新款号资料
     */
    boolean saveOrUpdateStyle(StyleInfo styleInfo);
    
    /**
     * 根据ID删除款号资料
     */
    boolean deleteById(Long id);

    boolean isPatternLocked(Long styleId);

    StyleInfo getValidatedForOrderCreate(String styleId, String styleNo);

    /**
     * 只更新 sizeColorConfig 字段，不走 saveOrUpdateStyle（避免误覆盖 price 等字段）
     */
    void updateSizeColorConfigOnly(Long styleId, String sizeColorConfig);

}
