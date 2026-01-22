package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.Dict;
import java.util.Map;
import org.springframework.cache.annotation.CacheEvict;

/**
 * 字典服务接口
 */
public interface DictService extends IService<Dict> {

    IPage<Dict> queryPage(Map<String, Object> params);
    
    /**
     * 保存字典数据（清除缓存）
     */
    @Override
    @CacheEvict(value = "dict", allEntries = true)
    default boolean save(Dict entity) {
        return IService.super.save(entity);
    }
    
    /**
     * 更新字典数据（清除缓存）
     */
    @Override
    @CacheEvict(value = "dict", allEntries = true)
    default boolean updateById(Dict entity) {
        return IService.super.updateById(entity);
    }
    
    /**
     * 删除字典数据（清除缓存）
     */
    @Override
    @CacheEvict(value = "dict", allEntries = true)
    default boolean removeById(java.io.Serializable id) {
        return IService.super.removeById(id);
    }
}
