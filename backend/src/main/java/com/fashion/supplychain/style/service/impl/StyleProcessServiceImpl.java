package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.mapper.StyleProcessMapper;
import com.fashion.supplychain.style.service.StyleProcessService;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class StyleProcessServiceImpl extends ServiceImpl<StyleProcessMapper, StyleProcess> implements StyleProcessService {
    @Override
    public List<StyleProcess> listByStyleId(Long styleId) {
        return list(new LambdaQueryWrapper<StyleProcess>().eq(StyleProcess::getStyleId, styleId).orderByAsc(StyleProcess::getSortOrder));
    }
}
