package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.mapper.StyleQuotationMapper;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class StyleQuotationServiceImpl extends ServiceImpl<StyleQuotationMapper, StyleQuotation> implements StyleQuotationService {

    @Autowired
    @Lazy
    private StyleBomService styleBomService;

    @Autowired
    @Lazy
    private StyleProcessService styleProcessService;

    // TODO [架构债务] TemplateLibraryService 是跨模块依赖（template→style）
    // resolveFinalUnitPriceByStyleIds()中的模板库回退查询应迁移到StyleQuotationOrchestrator
    @Autowired
    @Lazy
    private TemplateLibraryService templateLibraryService;

    @Override
    public StyleQuotation getByStyleId(Long styleId) {
        return getBaseMapper().selectOne(new QueryWrapper<StyleQuotation>()
                .eq("style_id", styleId)
                .orderByDesc("update_time")
                .orderByDesc("create_time")
                .last("limit 1"));
    }

    @Override
    public Map<Long, StyleQuotation> getLatestByStyleIds(Set<Long> styleIds) {
        Map<Long, StyleQuotation> latestByStyleId = new HashMap<>();
        if (styleIds == null || styleIds.isEmpty()) {
            return latestByStyleId;
        }

        List<StyleQuotation> quotations = this.list(new QueryWrapper<StyleQuotation>().in("style_id", styleIds));
        if (quotations == null || quotations.isEmpty()) {
            return latestByStyleId;
        }

        for (StyleQuotation q : quotations) {
            try {
                if (q == null || q.getStyleId() == null) {
                    continue;
                }
                StyleQuotation prev = latestByStyleId.get(q.getStyleId());
                if (prev == null) {
                    latestByStyleId.put(q.getStyleId(), q);
                    continue;
                }
                LocalDateTime pu = prev.getUpdateTime();
                LocalDateTime qu = q.getUpdateTime();
                if (qu != null && (pu == null || qu.isAfter(pu))) {
                    latestByStyleId.put(q.getStyleId(), q);
                    continue;
                }
                if (qu == null && pu == null) {
                    LocalDateTime pc = prev.getCreateTime();
                    LocalDateTime qc = q.getCreateTime();
                    if (qc != null && (pc == null || qc.isAfter(pc))) {
                        latestByStyleId.put(q.getStyleId(), q);
                    }
                }
            } catch (Exception e) {
                // 忽略异常数据，继续处理其他记录
                continue;
            }
        }
        return latestByStyleId;
    }

    @Override
    public Map<Long, BigDecimal> resolveFinalUnitPriceByStyleIds(Set<Long> styleIds, Map<Long, String> styleNoByStyleId) {
        Map<Long, BigDecimal> out = new HashMap<>();
        if (styleIds == null || styleIds.isEmpty()) {
            return out;
        }

        try {
            Map<Long, StyleQuotation> latestByStyleId = getLatestByStyleIds(styleIds);

            Set<Long> missing = new HashSet<>();
            for (Long sid : styleIds) {
                if (sid == null) {
                    continue;
                }
                StyleQuotation q = latestByStyleId.get(sid);
                BigDecimal tp = q == null ? null : q.getTotalPrice();
                if (tp != null && tp.compareTo(BigDecimal.ZERO) > 0) {
                    out.put(sid, tp.setScale(2, RoundingMode.HALF_UP));
                } else {
                    missing.add(sid);
                }
            }

            if (!missing.isEmpty()) {
                Map<Long, BigDecimal> derived = resolveDerivedUnitPriceByStyleIds(missing);
                for (Long sid : missing) {
                    if (sid == null || out.containsKey(sid)) {
                        continue;
                    }
                    BigDecimal dv = derived.get(sid);
                    if (dv != null && dv.compareTo(BigDecimal.ZERO) > 0) {
                        out.put(sid, dv.setScale(2, RoundingMode.HALF_UP));
                    }
                }
            }

            if (!missing.isEmpty() && templateLibraryService != null && styleNoByStyleId != null && !styleNoByStyleId.isEmpty()) {
                for (Long sid : missing) {
                    if (sid == null || out.containsKey(sid)) {
                        continue;
                    }
                    String styleNo = styleNoByStyleId.get(sid);
                    if (styleNo == null) {
                        continue;
                    }
                    String sn = styleNo.trim();
                    if (sn.isEmpty()) {
                        continue;
                    }
                    try {
                        BigDecimal tp = templateLibraryService.resolveTotalUnitPriceFromProgressTemplate(sn);
                        if (tp != null && tp.compareTo(BigDecimal.ZERO) > 0) {
                            out.put(sid, tp.setScale(2, RoundingMode.HALF_UP));
                        }
                    } catch (Exception ignored) {
                    }
                }
            }
        } catch (Exception e) {
            // 忽略异常，返回已处理的结果
        }

        return out;
    }

    private Map<Long, BigDecimal> resolveDerivedUnitPriceByStyleIds(Set<Long> styleIds) {
        if (styleIds == null || styleIds.isEmpty()) {
            return new HashMap<>();
        }

        if (styleBomService == null || styleProcessService == null) {
            return new HashMap<>();
        }

        Map<Long, BigDecimal> materialSum = new HashMap<>();
        try {
            List<StyleBom> boms = styleBomService.lambdaQuery()
                    .select(StyleBom::getStyleId, StyleBom::getTotalPrice, StyleBom::getUsageAmount,
                            StyleBom::getLossRate, StyleBom::getUnitPrice)
                    .in(StyleBom::getStyleId, styleIds)
                    .list();
            if (boms != null) {
                for (StyleBom b : boms) {
                    if (b == null || b.getStyleId() == null) {
                        continue;
                    }
                    BigDecimal itemTotal = null;
                    BigDecimal tp = b.getTotalPrice();
                    if (tp != null && tp.compareTo(BigDecimal.ZERO) > 0) {
                        itemTotal = tp;
                    } else {
                        BigDecimal usage = b.getUsageAmount() == null ? BigDecimal.ZERO : b.getUsageAmount();
                        BigDecimal loss = b.getLossRate() == null ? BigDecimal.ZERO : b.getLossRate();
                        BigDecimal unit = b.getUnitPrice() == null ? BigDecimal.ZERO : b.getUnitPrice();
                        if (usage.compareTo(BigDecimal.ZERO) < 0) {
                            usage = BigDecimal.ZERO;
                        }
                        if (loss.compareTo(BigDecimal.ZERO) < 0) {
                            loss = BigDecimal.ZERO;
                        }
                        if (unit.compareTo(BigDecimal.ZERO) < 0) {
                            unit = BigDecimal.ZERO;
                        }
                        BigDecimal qty = usage.multiply(BigDecimal.ONE.add(loss.movePointLeft(2)));
                        itemTotal = qty.multiply(unit);
                    }
                    if (itemTotal == null || itemTotal.compareTo(BigDecimal.ZERO) <= 0) {
                        continue;
                    }
                    Long sid = b.getStyleId();
                    materialSum.put(sid, materialSum.getOrDefault(sid, BigDecimal.ZERO).add(itemTotal));
                }
            }
        } catch (Exception ignored) {
        }

        Map<Long, BigDecimal> processSum = new HashMap<>();
        try {
            List<StyleProcess> procs = styleProcessService.lambdaQuery()
                    .select(StyleProcess::getStyleId, StyleProcess::getPrice)
                    .in(StyleProcess::getStyleId, styleIds)
                    .list();
            if (procs != null) {
                for (StyleProcess p : procs) {
                    if (p == null || p.getStyleId() == null) {
                        continue;
                    }
                    BigDecimal v = p.getPrice();
                    if (v == null || v.compareTo(BigDecimal.ZERO) <= 0) {
                        continue;
                    }
                    processSum.put(p.getStyleId(), processSum.getOrDefault(p.getStyleId(), BigDecimal.ZERO).add(v));
                }
            }
        } catch (Exception ignored) {
        }

        BigDecimal multiplier = BigDecimal.ONE.add(new BigDecimal("20").movePointLeft(2));

        Map<Long, BigDecimal> out = new HashMap<>();
        for (Long sid : styleIds) {
            if (sid == null) {
                continue;
            }
            BigDecimal material = materialSum.getOrDefault(sid, BigDecimal.ZERO);
            BigDecimal proc = processSum.getOrDefault(sid, BigDecimal.ZERO);
            BigDecimal cost = material.add(proc);
            if (cost.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal price = cost.multiply(multiplier).setScale(2, RoundingMode.HALF_UP);
            if (price.compareTo(BigDecimal.ZERO) > 0) {
                out.put(sid, price);
            }
        }
        return out;
    }
}
