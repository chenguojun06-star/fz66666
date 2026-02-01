package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/style/quotation")
public class StyleQuotationController {

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private StyleInfoService styleInfoService;

    @GetMapping
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<StyleQuotation> getByStyleId(@RequestParam Long styleId) {
        StyleQuotation quotation = styleQuotationService.getByStyleId(styleId);
        return Result.success(quotation);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    @Transactional
    public Result<Boolean> saveOrUpdate(@RequestBody StyleQuotation styleQuotation) {
        if (styleQuotation == null || styleQuotation.getStyleId() == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }

        StyleQuotation existingQuotation = styleQuotationService.getByStyleId(styleQuotation.getStyleId());
        if (existingQuotation != null) {
            styleQuotation.setId(existingQuotation.getId());
            if (styleQuotation.getCreateTime() == null) {
                styleQuotation.setCreateTime(existingQuotation.getCreateTime());
            }
        }

        if (styleQuotation.getCreateTime() == null) {
            styleQuotation.setCreateTime(LocalDateTime.now());
        }
        styleQuotation.setUpdateTime(LocalDateTime.now());

        BigDecimal materialCost = styleQuotation.getMaterialCost() == null ? BigDecimal.ZERO
                : styleQuotation.getMaterialCost();
        BigDecimal processCost = styleQuotation.getProcessCost() == null ? BigDecimal.ZERO
                : styleQuotation.getProcessCost();
        BigDecimal otherCost = styleQuotation.getOtherCost() == null ? BigDecimal.ZERO
                : styleQuotation.getOtherCost();
        styleQuotation.setTotalCost(materialCost.add(processCost).add(otherCost).setScale(2, RoundingMode.HALF_UP));

        BigDecimal profitRate = styleQuotation.getProfitRate() == null ? BigDecimal.ZERO
                : styleQuotation.getProfitRate();
        BigDecimal multiplier = BigDecimal.ONE.add(profitRate.movePointLeft(2));
        styleQuotation
                .setTotalPrice(styleQuotation.getTotalCost().multiply(multiplier).setScale(2, RoundingMode.HALF_UP));

        boolean result = styleQuotationService.saveOrUpdate(styleQuotation);
        if (!result) {
            throw new IllegalStateException("保存报价单失败");
        }

        boolean syncOk = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, styleQuotation.getStyleId())
                .set(StyleInfo::getPrice, styleQuotation.getTotalPrice())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!syncOk) {
            throw new IllegalStateException("同步款号单价失败");
        }
        return Result.success(true);
    }
}
