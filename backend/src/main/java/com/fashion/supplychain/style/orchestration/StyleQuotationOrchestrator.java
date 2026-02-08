package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

/**
 * 款式报价编排器
 * 负责报价单保存、费用计算、同步单价到款式信息
 */
@Slf4j
@Service
public class StyleQuotationOrchestrator {

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private StyleInfoService styleInfoService;

    public StyleQuotation getByStyleId(Long styleId) {
        return styleQuotationService.getByStyleId(styleId);
    }

    /**
     * 保存或更新报价单，并同步总价到款式信息
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean saveOrUpdate(StyleQuotation styleQuotation) {
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

        // 计算总成本
        BigDecimal materialCost = styleQuotation.getMaterialCost() == null ? BigDecimal.ZERO
                : styleQuotation.getMaterialCost();
        BigDecimal processCost = styleQuotation.getProcessCost() == null ? BigDecimal.ZERO
                : styleQuotation.getProcessCost();
        BigDecimal otherCost = styleQuotation.getOtherCost() == null ? BigDecimal.ZERO
                : styleQuotation.getOtherCost();
        styleQuotation.setTotalCost(materialCost.add(processCost).add(otherCost).setScale(2, RoundingMode.HALF_UP));

        // 计算总价（含利润率）
        BigDecimal profitRate = styleQuotation.getProfitRate() == null ? BigDecimal.ZERO
                : styleQuotation.getProfitRate();
        BigDecimal multiplier = BigDecimal.ONE.add(profitRate.movePointLeft(2));
        styleQuotation
                .setTotalPrice(styleQuotation.getTotalCost().multiply(multiplier).setScale(2, RoundingMode.HALF_UP));

        boolean result = styleQuotationService.saveOrUpdate(styleQuotation);
        if (!result) {
            throw new IllegalStateException("保存报价单失败");
        }

        // 同步单价到款式信息
        boolean syncOk = styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, styleQuotation.getStyleId())
                .set(StyleInfo::getPrice, styleQuotation.getTotalPrice())
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();
        if (!syncOk) {
            throw new IllegalStateException("同步款号单价失败");
        }

        return true;
    }
}
