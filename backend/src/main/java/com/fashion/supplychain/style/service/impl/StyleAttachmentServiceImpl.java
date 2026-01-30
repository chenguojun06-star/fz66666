package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.mapper.StyleAttachmentMapper;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.util.Collections;
import java.util.List;

@Service
public class StyleAttachmentServiceImpl extends ServiceImpl<StyleAttachmentMapper, StyleAttachment> implements StyleAttachmentService {

    private static final String STATUS_ACTIVE = "active";
    private static final String BIZ_TYPE_PATTERN = "pattern";
    private static final String BIZ_TYPE_PATTERN_GRADING = "pattern_grading";

    @Override
    public List<StyleAttachment> listByStyleId(String styleId) {
        return listByStyleId(styleId, null);
    }

    @Override
    public List<StyleAttachment> listByStyleId(String styleId, String bizType) {
        LambdaQueryWrapper<StyleAttachment> wrapper = new LambdaQueryWrapper<StyleAttachment>()
                .eq(StyleAttachment::getStyleId, styleId)
                .orderByDesc(StyleAttachment::getCreateTime);
        if (StringUtils.hasText(bizType)) {
            wrapper.eq(StyleAttachment::getBizType, bizType.trim());
        }
        return list(wrapper);
    }

    @Override
    public StyleAttachment getLatestPattern(String styleId, String bizType) {
        if (!StringUtils.hasText(styleId) || !StringUtils.hasText(bizType)) {
            return null;
        }
        return getOne(new LambdaQueryWrapper<StyleAttachment>()
                .eq(StyleAttachment::getStyleId, styleId.trim())
                .eq(StyleAttachment::getBizType, bizType.trim())
                .eq(StyleAttachment::getStatus, STATUS_ACTIVE)
                .orderByDesc(StyleAttachment::getVersion)
                .orderByDesc(StyleAttachment::getCreateTime)
                .last("limit 1"));
    }

    @Override
    public List<StyleAttachment> listPatternVersions(String styleId, String bizType) {
        if (!StringUtils.hasText(styleId) || !StringUtils.hasText(bizType)) {
            return Collections.emptyList();
        }
        return list(new LambdaQueryWrapper<StyleAttachment>()
                .eq(StyleAttachment::getStyleId, styleId.trim())
                .eq(StyleAttachment::getBizType, bizType.trim())
                .orderByDesc(StyleAttachment::getVersion)
                .orderByDesc(StyleAttachment::getCreateTime));
    }

    @Override
    public boolean checkPatternComplete(String styleId) {
        if (!StringUtils.hasText(styleId)) {
            return false;
        }
        // 检查是否有纸样文件（开发纸样即可，不再强制要求放码纸样）
        StyleAttachment pattern = getLatestPattern(styleId.trim(), BIZ_TYPE_PATTERN);
        return pattern != null;
    }
}
