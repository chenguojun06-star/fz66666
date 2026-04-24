package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.mapper.StyleProcessMapper;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
public class StyleProcessServiceImpl extends ServiceImpl<StyleProcessMapper, StyleProcess> implements StyleProcessService {

    private final Cache<Long, List<StyleProcess>> processCache = Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();

    @Override
    public List<StyleProcess> listByStyleId(Long styleId) {
        List<StyleProcess> cached = processCache.getIfPresent(styleId);
        if (cached != null) {
            return cached;
        }
        List<StyleProcess> result = list(new LambdaQueryWrapper<StyleProcess>()
                .eq(StyleProcess::getStyleId, styleId)
                .orderByAsc(StyleProcess::getSortOrder)
                .orderByAsc(StyleProcess::getId));
        processCache.put(styleId, result);
        return result;
    }

    public void clearProcessCache(Long styleId) {
        if (styleId != null) {
            processCache.invalidate(styleId);
        }
    }

    @Override
    public boolean save(StyleProcess entity) {
        boolean result = super.save(entity);
        if (result && entity != null && entity.getStyleId() != null) {
            processCache.invalidate(entity.getStyleId());
        }
        return result;
    }

    @Override
    public boolean updateById(StyleProcess entity) {
        boolean result = super.updateById(entity);
        if (result && entity != null && entity.getStyleId() != null) {
            processCache.invalidate(entity.getStyleId());
        }
        return result;
    }

    @Override
    public boolean removeById(java.io.Serializable id) {
        StyleProcess existing = super.getById(id);
        boolean result = super.removeById(id);
        if (result && existing != null && existing.getStyleId() != null) {
            processCache.invalidate(existing.getStyleId());
        }
        return result;
    }
}
