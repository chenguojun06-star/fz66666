package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.mapper.StyleSizeMapper;
import com.fashion.supplychain.style.service.StyleSizeService;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class StyleSizeServiceImpl extends ServiceImpl<StyleSizeMapper, StyleSize> implements StyleSizeService {
    @Override
    public List<StyleSize> listByStyleId(Long styleId) {
        return list(new LambdaQueryWrapper<StyleSize>().eq(StyleSize::getStyleId, styleId).orderByAsc(StyleSize::getSort));
    }
}
