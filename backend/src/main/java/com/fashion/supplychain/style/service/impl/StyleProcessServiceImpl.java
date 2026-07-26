package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
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

    /**
     * P0 修复（铁律4 多租户隔离）：缓存键必须含 tenantId，防止跨租户串数据。
     * 旧逻辑键为 styleId（Long），依赖 styleId 全局唯一性假设；
     * 修复后键为 tenantId + ":" + styleId（String），显式按租户隔离。
     */
    private final Cache<String, List<StyleProcess>> processCache = Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();

    private static String buildCacheKey(Long styleId) {
        Long tenantId = UserContext.tenantId();
        return (tenantId == null ? "0" : tenantId.toString()) + ":" + styleId;
    }

    @Override
    public List<StyleProcess> listByStyleId(Long styleId) {
        String cacheKey = buildCacheKey(styleId);
        List<StyleProcess> cached = processCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }
        List<StyleProcess> result = list(new LambdaQueryWrapper<StyleProcess>()
                .eq(StyleProcess::getStyleId, styleId)
                .orderByAsc(StyleProcess::getSortOrder)
                .orderByAsc(StyleProcess::getId));
        processCache.put(cacheKey, result);
        return result;
    }

    public void clearProcessCache(Long styleId) {
        if (styleId != null) {
            processCache.invalidate(buildCacheKey(styleId));
        }
    }

    @Override
    public boolean save(StyleProcess entity) {
        boolean result = super.save(entity);
        if (result && entity != null && entity.getStyleId() != null) {
            processCache.invalidate(buildCacheKey(entity.getStyleId()));
        }
        return result;
    }

    @Override
    public boolean updateById(StyleProcess entity) {
        boolean result = super.updateById(entity);
        if (result && entity != null && entity.getStyleId() != null) {
            processCache.invalidate(buildCacheKey(entity.getStyleId()));
        }
        return result;
    }

    @Override
    public boolean removeById(java.io.Serializable id) {
        StyleProcess existing = super.getById(id);
        boolean result = super.removeById(id);
        if (result && existing != null && existing.getStyleId() != null) {
            processCache.invalidate(buildCacheKey(existing.getStyleId()));
        }
        return result;
    }
}
