package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleSizeService;
import java.time.LocalDateTime;
import java.util.List;
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
            throw new IllegalStateException("纸样已完成，不允许修改");
        }
        if (styleSize.getCreateTime() == null) {
            styleSize.setCreateTime(LocalDateTime.now());
        }
        styleSize.setUpdateTime(LocalDateTime.now());
        boolean ok = styleSizeService.save(styleSize);
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
            throw new IllegalStateException("纸样已完成，不允许修改");
        }
        styleSize.setStyleId(current.getStyleId());
        styleSize.setUpdateTime(LocalDateTime.now());
        boolean ok = styleSizeService.updateNullableFieldsById(styleSize);
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
            throw new IllegalStateException("纸样已完成，不允许修改");
        }
        boolean ok = styleSizeService.removeById(id);
        if (!ok) {
            if (styleSizeService.getById(id) == null) {
                log.warn("[SIZE-DELETE] id={} already deleted, idempotent success", id);
                return true;
            }
            throw new IllegalStateException("删除失败");
        }
        return true;
    }
}
