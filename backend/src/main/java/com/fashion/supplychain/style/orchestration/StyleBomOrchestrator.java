package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class StyleBomOrchestrator {

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    public List<StyleBom> listByStyleId(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        return styleBomService.listByStyleId(styleId);
    }

    public boolean save(StyleBom styleBom) {
        if (styleBom == null || styleBom.getStyleId() == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        normalizeAndCalc(styleBom);
        if (styleBom.getCreateTime() == null) {
            styleBom.setCreateTime(LocalDateTime.now());
        }
        styleBom.setUpdateTime(LocalDateTime.now());
        boolean ok = styleBomService.save(styleBom);
        if (ok) {
            tryCreateBomTemplate(styleBom.getStyleId());
        }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean update(StyleBom styleBom) {
        if (styleBom == null || styleBom.getId() == null) {
            throw new IllegalArgumentException("id不能为空");
        }
        StyleBom current = styleBomService.getById(styleBom.getId());
        if (current == null) {
            throw new NoSuchElementException("记录不存在");
        }
        if (styleBom.getStyleId() == null) {
            styleBom.setStyleId(current.getStyleId());
        }
        normalizeAndCalc(styleBom);
        styleBom.setUpdateTime(LocalDateTime.now());
        boolean ok = styleBomService.updateById(styleBom);
        if (ok) {
            Long styleId = styleBom.getStyleId() != null ? styleBom.getStyleId() : current.getStyleId();
            tryCreateBomTemplate(styleId);
        }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean delete(String id) {
        boolean ok = styleBomService.removeById(id);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    private void tryCreateBomTemplate(Long styleId) {
        try {
            StyleInfo style = styleId == null ? null : styleInfoService.getById(styleId);
            String styleNo = style == null ? null : style.getStyleNo();
            if (styleNo != null && !styleNo.trim().isEmpty()) {
                templateLibraryService.createFromStyle(styleNo.trim(), List.of("bom"));
            }
        } catch (Exception e) {
            log.warn("Failed to sync templates from style bom: styleId={}", styleId, e);
        }
    }

    private void normalizeAndCalc(StyleBom styleBom) {
        BigDecimal usageAmount = styleBom.getUsageAmount() == null ? BigDecimal.ZERO : styleBom.getUsageAmount();
        BigDecimal lossRate = styleBom.getLossRate() == null ? BigDecimal.ZERO : styleBom.getLossRate();
        BigDecimal unitPrice = styleBom.getUnitPrice() == null ? BigDecimal.ZERO : styleBom.getUnitPrice();

        BigDecimal qty = usageAmount.multiply(BigDecimal.ONE.add(lossRate.movePointLeft(2)));
        styleBom.setTotalPrice(qty.multiply(unitPrice));
    }
}
