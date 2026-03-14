package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.mapper.StyleSizeMapper;
import com.fashion.supplychain.style.service.StyleSizeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class StyleSizeServiceImpl extends ServiceImpl<StyleSizeMapper, StyleSize> implements StyleSizeService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private volatile Boolean imageUrlsColumnExists;

    @Override
    public List<StyleSize> listByStyleId(Long styleId) {
        LambdaQueryWrapper<StyleSize> queryWrapper;
        if (hasImageUrlsColumn()) {
            queryWrapper = new LambdaQueryWrapper<StyleSize>()
                .select(
                    StyleSize::getId,
                    StyleSize::getStyleId,
                    StyleSize::getSizeName,
                    StyleSize::getPartName,
                    StyleSize::getMeasureMethod,
                    StyleSize::getStandardValue,
                    StyleSize::getTolerance,
                    StyleSize::getSort,
                    StyleSize::getCreateTime,
                    StyleSize::getUpdateTime,
                    StyleSize::getImageUrls,
                    StyleSize::getTenantId
                )
                .eq(StyleSize::getStyleId, styleId)
                .orderByAsc(StyleSize::getSort);
        } else {
            queryWrapper = new LambdaQueryWrapper<StyleSize>()
                .select(
                    StyleSize::getId,
                    StyleSize::getStyleId,
                    StyleSize::getSizeName,
                    StyleSize::getPartName,
                    StyleSize::getMeasureMethod,
                    StyleSize::getStandardValue,
                    StyleSize::getTolerance,
                    StyleSize::getSort,
                    StyleSize::getCreateTime,
                    StyleSize::getUpdateTime,
                    StyleSize::getTenantId
                )
                .eq(StyleSize::getStyleId, styleId)
                .orderByAsc(StyleSize::getSort);
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
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_size' AND COLUMN_NAME = 'image_urls'",
                    Integer.class
            );
            boolean exists = count != null && count > 0;
            imageUrlsColumnExists = exists;
            return exists;
        } catch (Exception ex) {
            imageUrlsColumnExists = false;
            return false;
        }
    }
}
