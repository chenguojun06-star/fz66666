package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
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
    private volatile Boolean groupNameColumnExists;
    private volatile Boolean baseSizeColumnExists;
    private volatile Boolean gradingRuleColumnExists;

    @Override
    public List<StyleSize> listByStyleId(Long styleId) {
        boolean includeImageUrls = hasImageUrlsColumn();
        boolean includeGroupName = hasGroupNameColumn();
        LambdaQueryWrapper<StyleSize> queryWrapper;
        boolean includeBaseSize = hasBaseSizeColumn();
        boolean includeGradingRule = hasGradingRuleColumn();
        if (includeImageUrls && includeGroupName && includeBaseSize && includeGradingRule) {
            queryWrapper = new LambdaQueryWrapper<StyleSize>()
                .select(
                    StyleSize::getId,
                    StyleSize::getStyleId,
                    StyleSize::getSizeName,
                    StyleSize::getPartName,
                    StyleSize::getGroupName,
                    StyleSize::getMeasureMethod,
                    StyleSize::getBaseSize,
                    StyleSize::getStandardValue,
                    StyleSize::getTolerance,
                    StyleSize::getSort,
                    StyleSize::getCreateTime,
                    StyleSize::getUpdateTime,
                    StyleSize::getImageUrls,
                    StyleSize::getGradingRule,
                    StyleSize::getTenantId
                )
                .eq(StyleSize::getStyleId, styleId)
                .orderByAsc(StyleSize::getSort);
        } else if (includeImageUrls && includeGroupName && includeBaseSize) {
            queryWrapper = new LambdaQueryWrapper<StyleSize>()
                .select(
                    StyleSize::getId,
                    StyleSize::getStyleId,
                    StyleSize::getSizeName,
                    StyleSize::getPartName,
                    StyleSize::getGroupName,
                    StyleSize::getMeasureMethod,
                    StyleSize::getBaseSize,
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
        } else if (includeImageUrls) {
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
        } else if (includeGroupName) {
            queryWrapper = new LambdaQueryWrapper<StyleSize>()
                .select(
                    StyleSize::getId,
                    StyleSize::getStyleId,
                    StyleSize::getSizeName,
                    StyleSize::getPartName,
                    StyleSize::getGroupName,
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

    @Override
    public boolean updateNullableFieldsById(StyleSize styleSize) {
        if (styleSize == null || styleSize.getId() == null) {
            return false;
        }

        LambdaUpdateWrapper<StyleSize> updateWrapper = new LambdaUpdateWrapper<StyleSize>()
            .eq(StyleSize::getId, styleSize.getId())
            .set(StyleSize::getStyleId, styleSize.getStyleId())
            .set(StyleSize::getSizeName, styleSize.getSizeName())
            .set(StyleSize::getPartName, styleSize.getPartName())
            .set(StyleSize::getMeasureMethod, styleSize.getMeasureMethod())
            .set(StyleSize::getStandardValue, styleSize.getStandardValue())
            .set(StyleSize::getTolerance, styleSize.getTolerance())
            .set(StyleSize::getSort, styleSize.getSort())
            .set(StyleSize::getUpdateTime, styleSize.getUpdateTime());

        if (hasGroupNameColumn()) {
            updateWrapper.set(StyleSize::getGroupName, styleSize.getGroupName());
        }
        if (hasBaseSizeColumn()) {
            updateWrapper.set(StyleSize::getBaseSize, styleSize.getBaseSize());
        }
        if (hasImageUrlsColumn()) {
            updateWrapper.set(StyleSize::getImageUrls, styleSize.getImageUrls());
        }
        if (hasGradingRuleColumn()) {
            updateWrapper.set(StyleSize::getGradingRule, styleSize.getGradingRule());
        }

        return update(updateWrapper);
    }

    private boolean hasGroupNameColumn() {
        Boolean cached = groupNameColumnExists;
        if (cached != null) {
            return cached;
        }
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_size' AND COLUMN_NAME = 'group_name'",
                    Integer.class
            );
            boolean exists = count != null && count > 0;
            groupNameColumnExists = exists;
            return exists;
        } catch (Exception ex) {
            groupNameColumnExists = false;
            return false;
        }
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

    private boolean hasBaseSizeColumn() {
        Boolean cached = baseSizeColumnExists;
        if (cached != null) {
            return cached;
        }
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_size' AND COLUMN_NAME = 'base_size'",
                    Integer.class
            );
            boolean exists = count != null && count > 0;
            baseSizeColumnExists = exists;
            return exists;
        } catch (Exception ex) {
            baseSizeColumnExists = false;
            return false;
        }
    }

    private boolean hasGradingRuleColumn() {
        Boolean cached = gradingRuleColumnExists;
        if (cached != null) {
            return cached;
        }
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_size' AND COLUMN_NAME = 'grading_rule'",
                    Integer.class
            );
            boolean exists = count != null && count > 0;
            gradingRuleColumnExists = exists;
            return exists;
        } catch (Exception ex) {
            gradingRuleColumnExists = false;
            return false;
        }
    }
}
