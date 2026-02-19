package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class OrderPriceFillHelper {

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    public void fillFactoryUnitPrice(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> orderIds = records.stream()
                .map(r -> r == null ? null : r.getId())
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty()) {
            return;
        }

        Map<String, BigDecimal> fromScanRecordSum = new HashMap<>();
        try {
            int lim = Math.min(20000, Math.max(1000, orderIds.size() * 200));
            LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getOrderId, ScanRecord::getProcessName, ScanRecord::getUnitPrice,
                            ScanRecord::getScanTime, ScanRecord::getCreateTime)
                    .in(ScanRecord::getOrderId, orderIds)
                    .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting"))
                    .eq(ScanRecord::getScanResult, "success")
                    .isNotNull(ScanRecord::getUnitPrice)
                    .orderByDesc(ScanRecord::getScanTime)
                    .orderByDesc(ScanRecord::getCreateTime);
            List<ScanRecord> list = scanRecordMapper
                    .selectPage(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1,
                            lim), qw)
                    .getRecords();

            if (list != null && !list.isEmpty()) {
                Map<String, LinkedHashSet<String>> seenByOrder = new HashMap<>();
                Map<String, BigDecimal> sumByOrder = new HashMap<>();
                for (ScanRecord r : list) {
                    if (r == null || !StringUtils.hasText(r.getOrderId())) {
                        continue;
                    }
                    String oid = r.getOrderId().trim();
                    String pn = StringUtils.hasText(r.getProcessName()) ? r.getProcessName().trim() : "";
                    if (!StringUtils.hasText(pn)) {
                        continue;
                    }
                    LinkedHashSet<String> seen = seenByOrder.computeIfAbsent(oid, k -> new LinkedHashSet<>());
                    if (!seen.add(pn)) {
                        continue;
                    }
                    BigDecimal up = r.getUnitPrice();
                    if (up == null || up.compareTo(BigDecimal.ZERO) <= 0) {
                        continue;
                    }
                    sumByOrder.put(oid, sumByOrder.getOrDefault(oid, BigDecimal.ZERO).add(up));
                }
                for (Map.Entry<String, BigDecimal> e : sumByOrder.entrySet()) {
                    if (e.getValue() != null && e.getValue().compareTo(BigDecimal.ZERO) > 0) {
                        fromScanRecordSum.put(e.getKey(), e.getValue().setScale(2, RoundingMode.HALF_UP));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve unit price from scan records: orderIdsCount={}", orderIds.size(), e);
        }

        Map<String, BigDecimal> tplSumByStyleNo = new HashMap<>();

        for (ProductionOrder o : records) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            String oid = o.getId().trim();
            BigDecimal picked = fromScanRecordSum.get(oid);
            if (picked != null && picked.compareTo(BigDecimal.ZERO) > 0) {
                o.setFactoryUnitPrice(picked);
                continue;
            }
            String sn = StringUtils.hasText(o.getStyleNo()) ? o.getStyleNo().trim() : null;
            if (!StringUtils.hasText(sn)) {
                o.setFactoryUnitPrice(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
                continue;
            }
            BigDecimal fromTpl = tplSumByStyleNo.computeIfAbsent(sn, k -> {
                try {
                    BigDecimal v = templateLibraryService.resolveTotalUnitPriceFromProgressTemplate(k);
                    return v == null ? BigDecimal.ZERO : v;
                } catch (Exception e) {
                    log.warn("Failed to resolve unit price from progress template: styleNo={}", k, e);
                    return BigDecimal.ZERO;
                }
            });
            if (fromTpl == null || fromTpl.compareTo(BigDecimal.ZERO) <= 0) {
                fromTpl = BigDecimal.ZERO;
            }
            o.setFactoryUnitPrice(fromTpl.setScale(2, RoundingMode.HALF_UP));
        }
    }

    public void fillQuotationUnitPrice(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        // 收集所有 styleId（Long）
        Set<Long> styleIds = new LinkedHashSet<>();
        for (ProductionOrder o : records) {
            if (o == null) continue;
            String sidRaw = o.getStyleId();
            if (!StringUtils.hasText(sidRaw)) continue;
            try { styleIds.add(Long.parseLong(sidRaw.trim())); } catch (Exception ignore) {}
        }

        if (styleIds.isEmpty()) {
            for (ProductionOrder o : records) {
                if (o != null) o.setQuotationUnitPrice(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
            }
            return;
        }

        // 从 t_style_quotation 读取 profitRate（用于计算含利润的单价）
        // 注意：不使用存储的 total_price，因为该值在BOM录入后未及时更新可能已过时
        Map<Long, BigDecimal> profitRateByStyle = new HashMap<>();
        try {
            List<com.fashion.supplychain.style.entity.StyleQuotation> allQuotations =
                    styleQuotationService.lambdaQuery()
                            .in(com.fashion.supplychain.style.entity.StyleQuotation::getStyleId, styleIds)
                            .list();
            if (allQuotations != null) {
                // 每个款式取一条：优先 is_locked=1，其次取 id 最大的
                Map<Long, com.fashion.supplychain.style.entity.StyleQuotation> bestByStyle = new HashMap<>();
                for (com.fashion.supplychain.style.entity.StyleQuotation q : allQuotations) {
                    if (q == null || q.getStyleId() == null) continue;
                    Long sid = q.getStyleId();
                    com.fashion.supplychain.style.entity.StyleQuotation existing = bestByStyle.get(sid);
                    if (existing == null) {
                        bestByStyle.put(sid, q);
                    } else {
                        boolean qLocked = Integer.valueOf(1).equals(q.getIsLocked());
                        boolean exLocked = Integer.valueOf(1).equals(existing.getIsLocked());
                        if (qLocked && !exLocked) {
                            bestByStyle.put(sid, q);
                        } else if (!exLocked && q.getId() != null && existing.getId() != null && parseLongSafe(q.getId()) > parseLongSafe(existing.getId())) {
                            bestByStyle.put(sid, q);
                        }
                    }
                }
                for (Map.Entry<Long, com.fashion.supplychain.style.entity.StyleQuotation> entry : bestByStyle.entrySet()) {
                    BigDecimal pr = entry.getValue().getProfitRate();
                    profitRateByStyle.put(entry.getKey(), pr != null ? pr : BigDecimal.ZERO);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load profitRate for fillQuotationUnitPrice: styleIdsCount={}", styleIds.size(), e);
        }

        // 实时从 BOM、工序、二次工艺计算当前真实成本（不依赖报价单存储的过时 material_cost）
        Map<Long, BigDecimal> bomSum = new HashMap<>();
        Map<Long, BigDecimal> processSum = new HashMap<>();
        Map<Long, BigDecimal> secondarySum = new HashMap<>();
        try {
            styleBomService.lambdaQuery().in(StyleBom::getStyleId, styleIds).list()
                    .forEach(b -> {
                        if (b == null || b.getStyleId() == null) return;
                        BigDecimal item = b.getTotalPrice();
                        if (item == null || item.compareTo(BigDecimal.ZERO) <= 0) {
                            BigDecimal usage = b.getUsageAmount() != null ? b.getUsageAmount() : BigDecimal.ZERO;
                            BigDecimal loss  = b.getLossRate()    != null ? b.getLossRate()    : BigDecimal.ZERO;
                            BigDecimal unit  = b.getUnitPrice()   != null ? b.getUnitPrice()   : BigDecimal.ZERO;
                            item = usage.multiply(BigDecimal.ONE.add(loss.movePointLeft(2))).multiply(unit);
                        }
                        bomSum.merge(b.getStyleId(), item.max(BigDecimal.ZERO), BigDecimal::add);
                    });
        } catch (Exception e) {
            log.warn("Failed to compute BOM cost for fillQuotationUnitPrice", e);
        }
        try {
            styleProcessService.lambdaQuery().in(StyleProcess::getStyleId, styleIds).list()
                    .forEach(p -> {
                        if (p == null || p.getStyleId() == null) return;
                        BigDecimal price = p.getPrice() != null ? p.getPrice() : BigDecimal.ZERO;
                        processSum.merge(p.getStyleId(), price.max(BigDecimal.ZERO), BigDecimal::add);
                    });
        } catch (Exception e) {
            log.warn("Failed to compute process cost for fillQuotationUnitPrice", e);
        }
        try {
            secondaryProcessService.lambdaQuery().in(SecondaryProcess::getStyleId, styleIds).list()
                    .forEach(s -> {
                        if (s == null || s.getStyleId() == null) return;
                        BigDecimal price = s.getTotalPrice() != null ? s.getTotalPrice() : BigDecimal.ZERO;
                        secondarySum.merge(s.getStyleId(), price.max(BigDecimal.ZERO), BigDecimal::add);
                    });
        } catch (Exception e) {
            log.warn("Failed to compute secondary cost for fillQuotationUnitPrice", e);
        }

        for (ProductionOrder o : records) {
            if (o == null) continue;
            BigDecimal unitPrice = BigDecimal.ZERO;
            String sidRaw = o.getStyleId();
            if (StringUtils.hasText(sidRaw)) {
                try {
                    Long sid = Long.parseLong(sidRaw.trim());
                    // 实时成本 = BOM + 工序 + 二次工艺
                    BigDecimal freshCost = bomSum.getOrDefault(sid, BigDecimal.ZERO)
                            .add(processSum.getOrDefault(sid, BigDecimal.ZERO))
                            .add(secondarySum.getOrDefault(sid, BigDecimal.ZERO));
                    if (freshCost.compareTo(BigDecimal.ZERO) > 0) {
                        // 含利润率：cost × (1 + profitRate%)
                        BigDecimal profitRate = profitRateByStyle.getOrDefault(sid, BigDecimal.ZERO);
                        BigDecimal multiplier = BigDecimal.ONE.add(profitRate.movePointLeft(2));
                        unitPrice = freshCost.multiply(multiplier).setScale(2, RoundingMode.HALF_UP);
                    }
                } catch (Exception ignore) {}
            }
            o.setQuotationUnitPrice(unitPrice.compareTo(BigDecimal.ZERO) > 0
                    ? unitPrice : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        }
    }

    /**
     * 从 progressWorkflowJson 中解析工序节点单价列表，填充到 progressNodeUnitPrices 虚拟字段。
     * 前端通过 record.progressNodeUnitPrices 读取各工序单价。
     */
    @SuppressWarnings("unchecked")
    public void fillProgressNodeUnitPrices(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        com.fasterxml.jackson.databind.ObjectMapper mapper =
                new com.fasterxml.jackson.databind.ObjectMapper();
        for (ProductionOrder o : records) {
            if (o == null) {
                continue;
            }
            String json = o.getProgressWorkflowJson();
            if (!StringUtils.hasText(json)) {
                o.setProgressNodeUnitPrices(java.util.Collections.emptyList());
                continue;
            }
            try {
                Map<String, Object> root = mapper.readValue(json, Map.class);
                Object nodesObj = root.get("nodes");
                if (nodesObj instanceof List) {
                    o.setProgressNodeUnitPrices((List<Object>) nodesObj);
                } else {
                    o.setProgressNodeUnitPrices(java.util.Collections.emptyList());
                }
            } catch (Exception e) {
                log.warn("Failed to parse progressWorkflowJson for order: id={}", o.getId(), e);
                o.setProgressNodeUnitPrices(java.util.Collections.emptyList());
            }
        }
    }

    private long parseLongSafe(String s) {
        try {
            return Long.parseLong(s.trim());
        } catch (Exception e) {
            return 0L;
        }
    }
}
