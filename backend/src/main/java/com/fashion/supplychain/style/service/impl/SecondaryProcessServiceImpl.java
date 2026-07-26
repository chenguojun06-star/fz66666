package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
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

    /**
     * P0 修复（铁律4 多租户隔离）：缓存键必须含 tenantId，防止跨租户串数据。
     * 旧逻辑键为 styleId（Long），依赖 styleId 全局唯一性假设；
     * 修复后键为 tenantId + ":" + styleId（String），显式按租户隔离。
     */
    private final Cache<String, List<SecondaryProcess>> secondaryCache = Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();

    private static String buildCacheKey(Long styleId) {
        Long tenantId = UserContext.tenantId();
        return (tenantId == null ? "0" : tenantId.toString()) + ":" + styleId;
    }

    @Override
    public List<SecondaryProcess> listByStyleId(Long styleId) {
        String cacheKey = buildCacheKey(styleId);
        List<SecondaryProcess> cached = secondaryCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }
        LambdaQueryWrapper<SecondaryProcess> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SecondaryProcess::getStyleId, styleId)
               .orderByDesc(SecondaryProcess::getCreatedAt);
        List<SecondaryProcess> result = list(wrapper);
        secondaryCache.put(cacheKey, result);
        return result;
    }

    public void clearSecondaryCache(Long styleId) {
        if (styleId != null) {
            secondaryCache.invalidate(buildCacheKey(styleId));
        }
    }

    @Override
    public boolean save(SecondaryProcess entity) {
        boolean result = super.save(entity);
        if (result && entity != null && entity.getStyleId() != null) {
            secondaryCache.invalidate(buildCacheKey(entity.getStyleId()));
        }
        return result;
    }

    @Override
    public boolean updateById(SecondaryProcess entity) {
        boolean result = super.updateById(entity);
        if (result && entity != null && entity.getStyleId() != null) {
            secondaryCache.invalidate(buildCacheKey(entity.getStyleId()));
        }
        return result;
    }

    @Override
    public boolean removeById(java.io.Serializable id) {
        SecondaryProcess existing = super.getById(id);
        boolean result = super.removeById(id);
        if (result && existing != null && existing.getStyleId() != null) {
            secondaryCache.invalidate(buildCacheKey(existing.getStyleId()));
        }
        return result;
    }
}
