package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.system.entity.Dict;
import com.fashion.supplychain.system.mapper.DictMapper;
import com.fashion.supplychain.system.service.DictService;
import java.util.HashMap;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 字典服务实现
 * 
 * 缓存策略：
 * - 字典数据查询结果会被缓存，提升查询性能
 * - 保存/更新/删除操作会清空缓存，保证数据一致性
 */
@Service
public class DictServiceImpl extends ServiceImpl<DictMapper, Dict> implements DictService {

    @Override
    @Cacheable(value = "dict", key = "#params.toString()", unless = "#result == null || #result.records.empty")
    public IPage<Dict> queryPage(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;

        Integer page = ParamUtils.getPage(safeParams);
        Integer pageSize = ParamUtils.getPageSize(safeParams);

        Page<Dict> pageInfo = new Page<>(page, pageSize);

        String dictType = (String) safeParams.getOrDefault("dictType", "");
        String dictCode = (String) safeParams.getOrDefault("dictCode", "");
        String dictLabel = (String) safeParams.getOrDefault("dictLabel", "");
        String status = (String) safeParams.getOrDefault("status", "");

        LambdaQueryWrapper<Dict> wrapper = new LambdaQueryWrapper<Dict>()
                .eq(StringUtils.hasText(dictType), Dict::getDictType, dictType)
                .like(StringUtils.hasText(dictCode), Dict::getDictCode, dictCode)
                .like(StringUtils.hasText(dictLabel), Dict::getDictLabel, dictLabel)
                .eq(StringUtils.hasText(status), Dict::getStatus, status)
                .orderByAsc(Dict::getSort)
                .orderByAsc(Dict::getId);

        return baseMapper.selectPage(pageInfo, wrapper);
    }
}
