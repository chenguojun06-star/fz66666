package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.mapper.StyleQuotationMapper;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.stereotype.Service;

@Service
public class StyleQuotationServiceImpl extends ServiceImpl<StyleQuotationMapper, StyleQuotation> implements StyleQuotationService {
    @Override
    public StyleQuotation getByStyleId(Long styleId) {
        return getBaseMapper().selectOne(new QueryWrapper<StyleQuotation>()
                .eq("style_id", styleId)
                .orderByDesc("update_time")
                .orderByDesc("create_time")
                .last("limit 1"));
    }
}
