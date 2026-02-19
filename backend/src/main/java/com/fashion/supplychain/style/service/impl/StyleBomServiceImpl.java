package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.mapper.StyleBomMapper;
import com.fashion.supplychain.style.service.StyleBomService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class StyleBomServiceImpl extends ServiceImpl<StyleBomMapper, StyleBom> implements StyleBomService {

    @Autowired
    private com.fashion.supplychain.service.RedisService redisService;

    /** BOM缓存前缀 */
    private static final String BOM_CACHE_PREFIX = "style:bom:";
    /** BOM列表缓存30分钟 */
    private static final long BOM_CACHE_TTL_MINUTES = 30;

    @Override
    public List<StyleBom> listByStyleId(Long styleId) {
        // 尝试从Redis缓存获取
        String cacheKey = BOM_CACHE_PREFIX + styleId;
        try {
            List<StyleBom> cached = redisService.get(cacheKey);
            if (cached != null) {
                log.debug("BOM缓存命中: styleId={}", styleId);
                return cached;
            }
        } catch (Exception e) {
            log.debug("BOM缓存读取失败: styleId={}", styleId);
        }

        List<StyleBom> result = list(new LambdaQueryWrapper<StyleBom>().eq(StyleBom::getStyleId, styleId));

        // 写入缓存
        try {
            redisService.set(cacheKey, result, BOM_CACHE_TTL_MINUTES, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.debug("BOM缓存写入失败: styleId={}", styleId);
        }

        return result;
    }

    @Override
    public List<StyleBom> listByMaterialCodes(java.util.List<String> materialCodes) {
        if (materialCodes == null || materialCodes.isEmpty()) {
            return java.util.Collections.emptyList();
        }
        return list(new LambdaQueryWrapper<StyleBom>()
                .in(StyleBom::getMaterialCode, materialCodes));
    }

    /**
     * @deprecated 已迁移到 StyleBomOrchestrator.saveBomWithStockCheck()
     * 消除 Service 层对 MaterialStockService（production模块）的跨模块依赖
     */
    @Deprecated
    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<StyleBom> saveBomWithStockCheck(List<StyleBom> bomList, Integer productionQty) {
        throw new UnsupportedOperationException("已迁移到 StyleBomOrchestrator.saveBomWithStockCheck()");
    }

    @Override
    public void clearBomCache(Long styleId) {
        if (styleId == null) {
            return;
        }
        try {
            redisService.delete(BOM_CACHE_PREFIX + styleId);
        } catch (Exception e) {
            log.debug("清除BOM缓存失败: styleId={}", styleId);
        }
    }

    /**
     * @deprecated 已迁移到 StyleBomOrchestrator.getBomStockSummary()
     * 消除 Service 层对 MaterialStockService（production模块）的跨模块依赖
     */
    @Deprecated
    @Override
    public Map<String, Object> getBomStockSummary(Long styleId, Integer productionQty) {
        throw new UnsupportedOperationException("已迁移到 StyleBomOrchestrator.getBomStockSummary()");
    }
}
