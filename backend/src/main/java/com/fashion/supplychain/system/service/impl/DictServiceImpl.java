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
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class DictServiceImpl extends ServiceImpl<DictMapper, Dict> implements DictService {

    @Override
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
