package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.mapper.SecondaryProcessMapper;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
public class SecondaryProcessServiceImpl extends ServiceImpl<SecondaryProcessMapper, SecondaryProcess> implements SecondaryProcessService {

    private final Cache<Long, List<SecondaryProcess>> secondaryCache = Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();

    @Override
    public List<SecondaryProcess> listByStyleId(Long styleId) {
        List<SecondaryProcess> cached = secondaryCache.getIfPresent(styleId);
        if (cached != null) {
            return cached;
        }
        LambdaQueryWrapper<SecondaryProcess> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SecondaryProcess::getStyleId, styleId)
               .orderByDesc(SecondaryProcess::getCreatedAt);
        List<SecondaryProcess> result = list(wrapper);
        secondaryCache.put(styleId, result);
        return result;
    }

    public void clearSecondaryCache(Long styleId) {
        if (styleId != null) {
            secondaryCache.invalidate(styleId);
        }
    }

    @Override
    public boolean save(SecondaryProcess entity) {
        boolean result = super.save(entity);
        if (result && entity != null && entity.getStyleId() != null) {
            secondaryCache.invalidate(entity.getStyleId());
        }
        return result;
    }

    @Override
    public boolean updateById(SecondaryProcess entity) {
        boolean result = super.updateById(entity);
        if (result && entity != null && entity.getStyleId() != null) {
            secondaryCache.invalidate(entity.getStyleId());
        }
        return result;
    }

    @Override
    public boolean removeById(java.io.Serializable id) {
        SecondaryProcess existing = super.getById(id);
        boolean result = super.removeById(id);
        if (result && existing != null && existing.getStyleId() != null) {
            secondaryCache.invalidate(existing.getStyleId());
        }
        return result;
    }
}
