package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;

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

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    public StyleQuotation getByStyleId(Long styleId) {
        return styleQuotationService.getByStyleId(styleId);
    }

    /**
     * 根据实时 BOM + 工序 + 二次工艺数据重算报价单并同步到 StyleInfo.price
     * <p>
     * BOM/工序/二次工艺 增删改时自动调用，防止报价表数据陈旧。
     * 仅当报价单已存在时才重算（如果用户还没创建过报价单则跳过）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void recalculateFromLiveData(Long styleId) {
        if (styleId == null) return;

        StyleQuotation existing = styleQuotationService.getByStyleId(styleId);
        if (existing == null) {
            // 尚无报价单，跳过自动同步
            log.debug("No quotation found for styleId={}, skip auto-sync", styleId);
            return;
        }

        // --- 实时汇总 BOM 面辅料成本 ---
        List<StyleBom> bomItems = styleBomService.listByStyleId(styleId);
        double materialTotal = bomItems.stream().mapToDouble(bom -> {
            BigDecimal tp = bom.getTotalPrice();
            if (tp != null) return tp.doubleValue();
            double usage = bom.getUsageAmount() != null ? bom.getUsageAmount().doubleValue() : 0.0;
            double loss  = bom.getLossRate()     != null ? bom.getLossRate().doubleValue()    : 0.0;
            double up    = bom.getUnitPrice()    != null ? bom.getUnitPrice().doubleValue()   : 0.0;
            return usage * (1.0 + loss / 100.0) * up;
        }).sum();

        // --- 实时汇总工序成本 ---
        List<StyleProcess> processes = styleProcessService.listByStyleId(styleId);
        double processTotal = processes.stream()
                .mapToDouble(p -> p.getPrice() != null ? p.getPrice().doubleValue() : 0.0)
                .sum();

        // --- 实时汇总二次工艺成本 ---
        List<SecondaryProcess> secondaryList = secondaryProcessService.listByStyleId(styleId);
        double otherTotal = secondaryList.stream()
                .mapToDouble(sp -> sp.getTotalPrice() != null ? sp.getTotalPrice().doubleValue() : 0.0)
                .sum();

        BigDecimal materialCost = BigDecimal.valueOf(materialTotal).setScale(2, RoundingMode.HALF_UP);
        BigDecimal processCost  = BigDecimal.valueOf(processTotal).setScale(2, RoundingMode.HALF_UP);
        BigDecimal otherCost    = BigDecimal.valueOf(otherTotal).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalCost    = materialCost.add(processCost).add(otherCost).setScale(2, RoundingMode.HALF_UP);

        BigDecimal profitRate = existing.getProfitRate() != null ? existing.getProfitRate() : BigDecimal.ZERO;
        BigDecimal multiplier = BigDecimal.ONE.add(profitRate.movePointLeft(2));
        BigDecimal totalPrice = totalCost.multiply(multiplier).setScale(2, RoundingMode.HALF_UP);

        // 更新报价单
        existing.setMaterialCost(materialCost);
        existing.setProcessCost(processCost);
        existing.setOtherCost(otherCost);
        existing.setTotalCost(totalCost);
        existing.setTotalPrice(totalPrice);
        existing.setUpdateTime(LocalDateTime.now());
        styleQuotationService.updateById(existing);

        // 同步到 StyleInfo.price
        styleInfoService.lambdaUpdate()
                .eq(StyleInfo::getId, styleId)
                .set(StyleInfo::getPrice, totalPrice)
                .set(StyleInfo::getUpdateTime, LocalDateTime.now())
                .update();

        log.info("Auto-synced quotation for styleId={}: material={}, process={}, other={}, total={}, price={}",
                styleId, materialCost, processCost, otherCost, totalCost, totalPrice);
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

        // 同步最终报价（含利润加成）到款式信息，用于财务结算单价展示
        // totalPrice = totalCost * (1 + profitRate%)
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
