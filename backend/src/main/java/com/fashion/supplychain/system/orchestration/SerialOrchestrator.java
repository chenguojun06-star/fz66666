package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Service
public class SerialOrchestrator {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductionOrderService productionOrderService;

    public String generate(String ruleCode) {
        String code = StringUtils.hasText(ruleCode) ? ruleCode.trim().toUpperCase() : "";
        if (!StringUtils.hasText(code)) {
            throw new IllegalArgumentException("ruleCode不能为空");
        }

        if ("STYLE_NO".equals(code)) {
            return nextStyleNo();
        }
        if ("ORDER_NO".equals(code)) {
            return nextOrderNo();
        }

        throw new IllegalArgumentException("不支持的ruleCode");
    }

    private String nextStyleNo() {
        String day = LocalDate.now().format(DAY_FMT);
        String prefix = "ST" + day;
        StyleInfo latest = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
                .likeRight(StyleInfo::getStyleNo, prefix)
                .orderByDesc(StyleInfo::getStyleNo)
                .last("limit 1"));

        int seq = resolveNextSeq(prefix, latest == null ? null : latest.getStyleNo());
        for (int i = 0; i < 200; i++) {
            String candidate = prefix + "%03d".formatted(seq);
            Long cnt = styleInfoService.count(new LambdaQueryWrapper<StyleInfo>()
                    .eq(StyleInfo::getStyleNo, candidate));
            if (cnt == null || cnt == 0) {
                return candidate;
            }
            seq += 1;
        }

        String fallback = String.valueOf(System.nanoTime());
        String suffix = fallback.length() > 6 ? fallback.substring(fallback.length() - 6) : fallback;
        return prefix + suffix;
    }

    private String nextOrderNo() {
        String day = LocalDate.now().format(DAY_FMT);
        String prefix = "PO" + day;
        ProductionOrder latest = productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                .likeRight(ProductionOrder::getOrderNo, prefix)
                .orderByDesc(ProductionOrder::getOrderNo)
                .last("limit 1"));

        int seq = resolveNextSeq(prefix, latest == null ? null : latest.getOrderNo());
        for (int i = 0; i < 200; i++) {
            String candidate = prefix + "%03d".formatted(seq);
            Long cnt = productionOrderService.count(new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getOrderNo, candidate));
            if (cnt == null || cnt == 0) {
                return candidate;
            }
            seq += 1;
        }

        String fallback = String.valueOf(System.nanoTime());
        String suffix = fallback.length() > 6 ? fallback.substring(fallback.length() - 6) : fallback;
        return prefix + suffix;
    }

    private int resolveNextSeq(String prefix, String latestValue) {
        if (!StringUtils.hasText(prefix) || !StringUtils.hasText(latestValue)) {
            return 1;
        }
        String v = latestValue.trim();
        if (!v.startsWith(prefix) || v.length() < prefix.length() + 3) {
            return 1;
        }
        String tail = v.substring(v.length() - 3);
        try {
            int n = Integer.parseInt(tail);
            return Math.max(1, n + 1);
        } catch (Exception e) {
            return 1;
        }
    }
}
