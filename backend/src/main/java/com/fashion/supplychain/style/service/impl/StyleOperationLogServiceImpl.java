package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.mapper.StyleOperationLogMapper;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
public class StyleOperationLogServiceImpl extends ServiceImpl<StyleOperationLogMapper, StyleOperationLog>
        implements StyleOperationLogService {

    @Override
    public List<StyleOperationLog> listByStyleId(Long styleId, String bizType, String action) {
        LambdaQueryWrapper<StyleOperationLog> wrapper = new LambdaQueryWrapper<StyleOperationLog>()
                .eq(StyleOperationLog::getStyleId, styleId)
                .orderByDesc(StyleOperationLog::getCreateTime);
        if (StringUtils.hasText(bizType)) {
            wrapper.eq(StyleOperationLog::getBizType, bizType.trim());
        }
        if (StringUtils.hasText(action)) {
            wrapper.eq(StyleOperationLog::getAction, action.trim());
        }
        return list(wrapper);
    }
}
