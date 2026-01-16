package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.mapper.StyleBomMapper;
import com.fashion.supplychain.style.service.StyleBomService;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class StyleBomServiceImpl extends ServiceImpl<StyleBomMapper, StyleBom> implements StyleBomService {
    @Override
    public List<StyleBom> listByStyleId(Long styleId) {
        return list(new LambdaQueryWrapper<StyleBom>().eq(StyleBom::getStyleId, styleId));
    }
}
