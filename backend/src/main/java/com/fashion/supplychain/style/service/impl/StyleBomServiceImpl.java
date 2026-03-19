package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.mapper.StyleBomMapper;
import com.fashion.supplychain.style.service.StyleBomService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class StyleBomServiceImpl extends ServiceImpl<StyleBomMapper, StyleBom> implements StyleBomService {

    @Autowired
    private com.fashion.supplychain.service.RedisService redisService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** BOM缓存前缀 */
    private static final String BOM_CACHE_PREFIX = "style:bom:";
    /** BOM列表缓存30分钟 */
    private static final long BOM_CACHE_TTL_MINUTES = 30;

    private volatile Boolean imageUrlsColumnExists;
    private volatile Boolean fabricCompositionColumnExists;

    @Override
    public List<StyleBom> listByStyleId(Long styleId) {
        boolean includeImageUrls = hasImageUrlsColumn();
        boolean includeFabricComposition = hasFabricCompositionColumn();
        // 尝试从Redis缓存获取
        String cacheKey = BOM_CACHE_PREFIX + styleId + ":" + (includeImageUrls ? "img" : "base") + ":" + (includeFabricComposition ? "comp" : "nocomp");
        try {
            List<StyleBom> cached = redisService.get(cacheKey);
            if (cached != null) {
                log.debug("BOM缓存命中: styleId={}", styleId);
                return cached;
            }
        } catch (Exception e) {
            log.debug("BOM缓存读取失败: styleId={}", styleId);
        }

        LambdaQueryWrapper<StyleBom> queryWrapper;
        if (includeImageUrls && includeFabricComposition) {
            queryWrapper = new LambdaQueryWrapper<StyleBom>()
                .select(
                    StyleBom::getId,
                    StyleBom::getStyleId,
                    StyleBom::getMaterialCode,
                    StyleBom::getMaterialName,
                    StyleBom::getFabricComposition,
                    StyleBom::getMaterialType,
                    StyleBom::getColor,
                    StyleBom::getSpecification,
                    StyleBom::getSize,
                    StyleBom::getUnit,
                    StyleBom::getUsageAmount,
                    StyleBom::getSizeUsageMap,
                    StyleBom::getLossRate,
                    StyleBom::getUnitPrice,
                    StyleBom::getTotalPrice,
                    StyleBom::getSupplier,
                    StyleBom::getSupplierContactPerson,
                    StyleBom::getSupplierContactPhone,
                    StyleBom::getRemark,
                    StyleBom::getStockStatus,
                    StyleBom::getAvailableStock,
                    StyleBom::getRequiredPurchase,
                    StyleBom::getCreateTime,
                    StyleBom::getUpdateTime,
                    StyleBom::getImageUrls,
                    StyleBom::getTenantId
                )
                .eq(StyleBom::getStyleId, styleId);
        } else if (includeImageUrls) {
            queryWrapper = new LambdaQueryWrapper<StyleBom>()
                    .select(
                            StyleBom::getId,
                            StyleBom::getStyleId,
                            StyleBom::getMaterialCode,
                            StyleBom::getMaterialName,
                            StyleBom::getMaterialType,
                            StyleBom::getColor,
                            StyleBom::getSpecification,
                            StyleBom::getSize,
                            StyleBom::getUnit,
                            StyleBom::getUsageAmount,
                            StyleBom::getSizeUsageMap,
                            StyleBom::getLossRate,
                            StyleBom::getUnitPrice,
                            StyleBom::getTotalPrice,
                            StyleBom::getSupplier,
                            StyleBom::getSupplierContactPerson,
                            StyleBom::getSupplierContactPhone,
                            StyleBom::getRemark,
                            StyleBom::getStockStatus,
                            StyleBom::getAvailableStock,
                            StyleBom::getRequiredPurchase,
                            StyleBom::getCreateTime,
                            StyleBom::getUpdateTime,
                            StyleBom::getImageUrls,
                            StyleBom::getTenantId
                    )
                    .eq(StyleBom::getStyleId, styleId);
        } else if (includeFabricComposition) {
            queryWrapper = new LambdaQueryWrapper<StyleBom>()
                .select(
                    StyleBom::getId,
                    StyleBom::getStyleId,
                    StyleBom::getMaterialCode,
                    StyleBom::getMaterialName,
                    StyleBom::getFabricComposition,
                    StyleBom::getMaterialType,
                    StyleBom::getColor,
                    StyleBom::getSpecification,
                    StyleBom::getSize,
                    StyleBom::getUnit,
                    StyleBom::getUsageAmount,
                    StyleBom::getSizeUsageMap,
                    StyleBom::getLossRate,
                    StyleBom::getUnitPrice,
                    StyleBom::getTotalPrice,
                    StyleBom::getSupplier,
                    StyleBom::getSupplierContactPerson,
                    StyleBom::getSupplierContactPhone,
                    StyleBom::getRemark,
                    StyleBom::getStockStatus,
                    StyleBom::getAvailableStock,
                    StyleBom::getRequiredPurchase,
                    StyleBom::getCreateTime,
                    StyleBom::getUpdateTime,
                    StyleBom::getTenantId
                )
                .eq(StyleBom::getStyleId, styleId);
        } else {
            queryWrapper = new LambdaQueryWrapper<StyleBom>()
                    .select(
                            StyleBom::getId,
                            StyleBom::getStyleId,
                            StyleBom::getMaterialCode,
                            StyleBom::getMaterialName,
                            StyleBom::getMaterialType,
                            StyleBom::getColor,
                            StyleBom::getSpecification,
                            StyleBom::getSize,
                            StyleBom::getUnit,
                            StyleBom::getUsageAmount,
                            StyleBom::getSizeUsageMap,
                            StyleBom::getLossRate,
                            StyleBom::getUnitPrice,
                            StyleBom::getTotalPrice,
                            StyleBom::getSupplier,
                            StyleBom::getSupplierContactPerson,
                            StyleBom::getSupplierContactPhone,
                            StyleBom::getRemark,
                            StyleBom::getStockStatus,
                            StyleBom::getAvailableStock,
                            StyleBom::getRequiredPurchase,
                            StyleBom::getCreateTime,
                            StyleBom::getUpdateTime,
                            StyleBom::getTenantId
                    )
                    .eq(StyleBom::getStyleId, styleId);
        }

        List<StyleBom> result = list(queryWrapper);

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
        LambdaQueryWrapper<StyleBom> queryWrapper;
        boolean includeImageUrls = hasImageUrlsColumn();
        boolean includeFabricComposition = hasFabricCompositionColumn();
        if (includeImageUrls && includeFabricComposition) {
            queryWrapper = new LambdaQueryWrapper<StyleBom>()
                .select(
                    StyleBom::getId,
                    StyleBom::getStyleId,
                    StyleBom::getMaterialCode,
                    StyleBom::getMaterialName,
                    StyleBom::getFabricComposition,
                    StyleBom::getMaterialType,
                    StyleBom::getColor,
                    StyleBom::getSpecification,
                    StyleBom::getSize,
                    StyleBom::getUnit,
                    StyleBom::getUsageAmount,
                    StyleBom::getLossRate,
                    StyleBom::getUnitPrice,
                    StyleBom::getTotalPrice,
                    StyleBom::getSupplier,
                    StyleBom::getSupplierContactPerson,
                    StyleBom::getSupplierContactPhone,
                    StyleBom::getRemark,
                    StyleBom::getStockStatus,
                    StyleBom::getAvailableStock,
                    StyleBom::getRequiredPurchase,
                    StyleBom::getCreateTime,
                    StyleBom::getUpdateTime,
                    StyleBom::getImageUrls,
                    StyleBom::getTenantId
                )
                .in(StyleBom::getMaterialCode, materialCodes);
        } else if (includeImageUrls) {
            queryWrapper = new LambdaQueryWrapper<StyleBom>()
                .select(
                    StyleBom::getId,
                    StyleBom::getStyleId,
                    StyleBom::getMaterialCode,
                    StyleBom::getMaterialName,
                    StyleBom::getMaterialType,
                    StyleBom::getColor,
                    StyleBom::getSpecification,
                    StyleBom::getSize,
                    StyleBom::getUnit,
                    StyleBom::getUsageAmount,
                    StyleBom::getLossRate,
                    StyleBom::getUnitPrice,
                    StyleBom::getTotalPrice,
                    StyleBom::getSupplier,
                    StyleBom::getSupplierContactPerson,
                    StyleBom::getSupplierContactPhone,
                    StyleBom::getRemark,
                    StyleBom::getStockStatus,
                    StyleBom::getAvailableStock,
                    StyleBom::getRequiredPurchase,
                    StyleBom::getCreateTime,
                    StyleBom::getUpdateTime,
                    StyleBom::getImageUrls,
                    StyleBom::getTenantId
                )
                .in(StyleBom::getMaterialCode, materialCodes);
        } else if (includeFabricComposition) {
            queryWrapper = new LambdaQueryWrapper<StyleBom>()
                .select(
                    StyleBom::getId,
                    StyleBom::getStyleId,
                    StyleBom::getMaterialCode,
                    StyleBom::getMaterialName,
                    StyleBom::getFabricComposition,
                    StyleBom::getMaterialType,
                    StyleBom::getColor,
                    StyleBom::getSpecification,
                    StyleBom::getSize,
                    StyleBom::getUnit,
                    StyleBom::getUsageAmount,
                    StyleBom::getLossRate,
                    StyleBom::getUnitPrice,
                    StyleBom::getTotalPrice,
                    StyleBom::getSupplier,
                    StyleBom::getSupplierContactPerson,
                    StyleBom::getSupplierContactPhone,
                    StyleBom::getRemark,
                    StyleBom::getStockStatus,
                    StyleBom::getAvailableStock,
                    StyleBom::getRequiredPurchase,
                    StyleBom::getCreateTime,
                    StyleBom::getUpdateTime,
                    StyleBom::getTenantId
                )
                .in(StyleBom::getMaterialCode, materialCodes);
        } else {
            queryWrapper = new LambdaQueryWrapper<StyleBom>()
                .select(
                    StyleBom::getId,
                    StyleBom::getStyleId,
                    StyleBom::getMaterialCode,
                    StyleBom::getMaterialName,
                    StyleBom::getMaterialType,
                    StyleBom::getColor,
                    StyleBom::getSpecification,
                    StyleBom::getSize,
                    StyleBom::getUnit,
                    StyleBom::getUsageAmount,
                    StyleBom::getLossRate,
                    StyleBom::getUnitPrice,
                    StyleBom::getTotalPrice,
                    StyleBom::getSupplier,
                    StyleBom::getSupplierContactPerson,
                    StyleBom::getSupplierContactPhone,
                    StyleBom::getRemark,
                    StyleBom::getStockStatus,
                    StyleBom::getAvailableStock,
                    StyleBom::getRequiredPurchase,
                    StyleBom::getCreateTime,
                    StyleBom::getUpdateTime,
                    StyleBom::getTenantId
                )
                .in(StyleBom::getMaterialCode, materialCodes);
        }
        return list(queryWrapper);
    }

    private boolean hasImageUrlsColumn() {
        Boolean cached = imageUrlsColumnExists;
        if (cached != null) {
            return cached;
        }
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_bom' AND COLUMN_NAME = 'image_urls'",
                    Integer.class
            );
            boolean exists = count != null && count > 0;
            imageUrlsColumnExists = exists;
            return exists;
        } catch (Exception ex) {
            log.warn("检查 t_style_bom.image_urls 失败，降级为不查询图片列", ex);
            imageUrlsColumnExists = false;
            return false;
        }
    }

    private boolean hasFabricCompositionColumn() {
        Boolean cached = fabricCompositionColumnExists;
        if (cached != null) {
            return cached;
        }
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_bom' AND COLUMN_NAME = 'fabric_composition'",
                    Integer.class
            );
            boolean exists = count != null && count > 0;
            fabricCompositionColumnExists = exists;
            return exists;
        } catch (Exception ex) {
            log.warn("检查 t_style_bom.fabric_composition 失败，降级为不查询成分列", ex);
            fabricCompositionColumnExists = false;
            return false;
        }
    }

    @Override
    public void clearBomCache(Long styleId) {
        if (styleId == null) {
            return;
        }
        try {
            redisService.deleteByPattern(BOM_CACHE_PREFIX + styleId + ":*");
        } catch (Exception e) {
            log.debug("清除BOM缓存失败: styleId={}", styleId);
        }
    }

    // ── 写操作拦截：任何写入都自动失效缓存，防止调用方忘记手动清缓存 ──────────────

    @Override
    public boolean save(StyleBom entity) {
        boolean result = super.save(entity);
        if (result && entity.getStyleId() != null) {
            clearBomCache(entity.getStyleId());
        }
        return result;
    }

    @Override
    public boolean updateById(StyleBom entity) {
        boolean result = super.updateById(entity);
        if (entity.getStyleId() != null) {
            clearBomCache(entity.getStyleId());
        }
        return result;
    }

    @Override
    public boolean updateBatchById(Collection<StyleBom> entityList) {
        boolean result = super.updateBatchById(entityList);
        entityList.stream()
                .map(StyleBom::getStyleId)
                .filter(Objects::nonNull)
                .distinct()
                .forEach(this::clearBomCache);
        return result;
    }

}
