package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleSizeService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class StyleSizeOrchestrator {

    @Autowired
    private StyleSizeService styleSizeService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    public List<StyleSize> listByStyleId(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        return styleSizeService.listByStyleId(styleId);
    }

    public boolean save(StyleSize styleSize) {
        if (styleSize == null || styleSize.getStyleId() == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        if (styleInfoService.isPatternLocked(styleSize.getStyleId())) {
            throw new IllegalStateException("纸样已完成，无法修改，请先回退");
        }
        if (styleSize.getCreateTime() == null) {
            styleSize.setCreateTime(LocalDateTime.now());
        }
        styleSize.setUpdateTime(LocalDateTime.now());
        boolean ok = styleSizeService.save(styleSize);
        // 样衣阶段不自动同步到模板库
        // if (ok) {
        //     tryCreateSizeTemplate(styleSize.getStyleId());
        // }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean update(StyleSize styleSize) {
        if (styleSize == null || styleSize.getId() == null) {
            throw new IllegalArgumentException("id不能为空");
        }
        StyleSize current = styleSizeService.getById(styleSize.getId());
        if (current == null) {
            throw new NoSuchElementException("记录不存在");
        }
        if (styleInfoService.isPatternLocked(current.getStyleId())) {
            throw new IllegalStateException("纸样已完成，无法修改，请先回退");
        }
        styleSize.setStyleId(current.getStyleId());
        styleSize.setUpdateTime(LocalDateTime.now());
        boolean ok = styleSizeService.updateById(styleSize);
        // 样衣阶段不自动同步到模板库
        // if (ok) {
        //     tryCreateSizeTemplate(current.getStyleId());
        // }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean delete(String id) {
        StyleSize current = styleSizeService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("记录不存在");
        }
        if (styleInfoService.isPatternLocked(current.getStyleId())) {
            throw new IllegalStateException("纸样已完成，无法修改，请先回退");
        }
        boolean ok = styleSizeService.removeById(id);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    private void tryCreateSizeTemplate(Long styleId) {
        try {
            StyleInfo style = styleId == null ? null : styleInfoService.getById(styleId);
            String styleNo = style == null ? null : style.getStyleNo();
            if (styleNo != null && !styleNo.trim().isEmpty()) {
                Map<String, Object> body = new HashMap<>();
                body.put("sourceStyleNo", styleNo.trim());
                body.put("templateTypes", List.of("size"));
                templateLibraryOrchestrator.createFromStyle(body);
            }
        } catch (Exception e) {
            log.warn("Failed to sync templates from style size: styleId={}", styleId, e);
        }
    }
}
