package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleQuotation;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;

public interface StyleQuotationService extends IService<StyleQuotation> {
    StyleQuotation getByStyleId(Long styleId);

    Map<Long, StyleQuotation> getLatestByStyleIds(Set<Long> styleIds);

    Map<Long, BigDecimal> resolveFinalUnitPriceByStyleIds(Set<Long> styleIds, Map<Long, String> styleNoByStyleId);
}
