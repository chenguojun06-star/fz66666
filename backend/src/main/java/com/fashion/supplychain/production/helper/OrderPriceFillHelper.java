package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
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

        Set<String> styleNos = new LinkedHashSet<>();
        Set<Long> styleIds = new LinkedHashSet<>();

        for (ProductionOrder o : records) {
            if (o == null) {
                continue;
            }
            String sn = StringUtils.hasText(o.getStyleNo()) ? o.getStyleNo().trim() : null;
            if (StringUtils.hasText(sn)) {
                styleNos.add(sn);
            }
            String sidRaw = o.getStyleId();
            if (!StringUtils.hasText(sidRaw)) {
                continue;
            }
            String sid = sidRaw.trim();
            boolean numeric = true;
            for (int i = 0; i < sid.length(); i++) {
                if (!Character.isDigit(sid.charAt(i))) {
                    numeric = false;
                    break;
                }
            }
            if (numeric) {
                try {
                    styleIds.add(Long.parseLong(sid));
                } catch (Exception ignore) {
                }
            }
        }

        Map<String, StyleInfo> styleByNo = new HashMap<>();
        Map<Long, String> styleNoByStyleId = new HashMap<>();
        if (!styleNos.isEmpty()) {
            try {
                List<StyleInfo> styles = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                        .select(StyleInfo::getId, StyleInfo::getStyleNo, StyleInfo::getPrice)
                        .in(StyleInfo::getStyleNo, styleNos)
                        .eq(StyleInfo::getStatus, "ENABLED"));
                if (styles != null) {
                    for (StyleInfo s : styles) {
                        if (s == null || !StringUtils.hasText(s.getStyleNo())) {
                            continue;
                        }
                        String k = s.getStyleNo().trim();
                        if (!styleByNo.containsKey(k)) {
                            styleByNo.put(k, s);
                        }
                        if (s.getId() != null) {
                            styleIds.add(s.getId());
                            styleNoByStyleId.put(s.getId(), k);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to query styles for quotation unit price: styleNosCount={}", styleNos.size(), e);
            }
        }

        Map<Long, BigDecimal> unitPriceByStyleId = new HashMap<>();
        if (!styleIds.isEmpty() && styleQuotationService != null) {
            try {
                unitPriceByStyleId = styleQuotationService.resolveFinalUnitPriceByStyleIds(styleIds, styleNoByStyleId);
            } catch (Exception e) {
                log.warn("Failed to resolve quotation unit price: styleIdsCount={}", styleIds.size(), e);
                unitPriceByStyleId = new HashMap<>();
            }
        }

        for (ProductionOrder o : records) {
            if (o == null) {
                continue;
            }
            BigDecimal picked = null;

            Long sid = null;
            String sidRaw0 = o.getStyleId();
            if (StringUtils.hasText(sidRaw0)) {
                String sidRaw = sidRaw0.trim();
                boolean numeric = true;
                for (int i = 0; i < sidRaw.length(); i++) {
                    if (!Character.isDigit(sidRaw.charAt(i))) {
                        numeric = false;
                        break;
                    }
                }
                if (numeric) {
                    try {
                        sid = Long.parseLong(sidRaw);
                    } catch (Exception ignore) {
                    }
                }
            }

            String sn = StringUtils.hasText(o.getStyleNo()) ? o.getStyleNo().trim() : null;
            StyleInfo style = StringUtils.hasText(sn) ? styleByNo.get(sn) : null;
            if (sid == null && style != null && style.getId() != null) {
                sid = style.getId();
            }

            if (sid != null) {
                BigDecimal tp = unitPriceByStyleId.get(sid);
                if (tp != null && tp.compareTo(BigDecimal.ZERO) > 0) {
                    picked = tp.setScale(2, RoundingMode.HALF_UP);
                }
            }

            if (picked == null && style != null) {
                BigDecimal sp = style.getPrice();
                if (sp != null && sp.compareTo(BigDecimal.ZERO) > 0) {
                    picked = sp.setScale(2, RoundingMode.HALF_UP);
                }
            }

            o.setQuotationUnitPrice(picked == null ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP) : picked);
        }
    }
}
