package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.mapper.StyleAttachmentMapper;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.util.List;

@Service
public class StyleAttachmentServiceImpl extends ServiceImpl<StyleAttachmentMapper, StyleAttachment> implements StyleAttachmentService {
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
}
