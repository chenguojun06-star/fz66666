package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class StyleIdResolver {

    private static StyleInfoService staticStyleInfoService;

    @Autowired
    public void setStyleInfoService(StyleInfoService styleInfoService) {
        StyleIdResolver.staticStyleInfoService = styleInfoService;
    }

    public static Long resolve(String styleId, String styleNo) {
        Long resolvedStyleId = null;
        if (StringUtils.hasText(styleId)) {
            try {
                resolvedStyleId = Long.parseLong(styleId.trim());
            } catch (NumberFormatException e) {
                styleNo = styleId.trim();
            }
        }
        if (resolvedStyleId == null && StringUtils.hasText(styleNo)) {
            Long currentTenantId = UserContext.tenantId();
            StyleInfo style = staticStyleInfoService.lambdaQuery()
                    .eq(StyleInfo::getStyleNo, styleNo.trim())
                    .eq(currentTenantId != null, StyleInfo::getTenantId, currentTenantId)
                    .orderByDesc(StyleInfo::getId)
                    .last("limit 1")
                    .one();
            if (style != null && style.getId() != null) {
                resolvedStyleId = style.getId();
            }
        }
        return resolvedStyleId;
    }
}
