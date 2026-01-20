package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.ProductOutstockMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Collections;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderQueryService {

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    @Autowired
    private ProductOutstockMapper productOutstockMapper;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        int page = ParamUtils.getPage(safeParams);
        int pageSize = ParamUtils.getPageSizeClamped(safeParams, 10, 1, 200);

        Page<ProductionOrder> pageInfo = new Page<>(page, pageSize);

        String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orderNo"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "styleNo"));
        String factoryName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "factoryName"));
        String status = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "status"));

        IPage<ProductionOrder> resultPage = productionOrderMapper.selectPage(pageInfo,
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(StringUtils.hasText(orderNo), ProductionOrder::getOrderNo, orderNo)
                        .like(StringUtils.hasText(styleNo), ProductionOrder::getStyleNo, styleNo)
                        .like(StringUtils.hasText(factoryName), ProductionOrder::getFactoryName, factoryName)
                        .eq(StringUtils.hasText(status), ProductionOrder::getStatus, status)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .orderByDesc(ProductionOrder::getCreateTime));

        fillStyleCover(resultPage.getRecords());
        fillCuttingSummary(resultPage.getRecords());
        fillCurrentProcessName(resultPage.getRecords());
        fillStockSummary(resultPage.getRecords());
        fillFlowStageFields(resultPage.getRecords());
        fixProductionProgressByCompletedQuantity(resultPage.getRecords());
        fillFactoryUnitPrice(resultPage.getRecords());
        fillQuotationUnitPrice(resultPage.getRecords());

        return resultPage;
    }

    public ProductionOrder getDetailById(String id) {
        ProductionOrder productionOrder = productionOrderMapper.selectOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getId, id)
                .eq(ProductionOrder::getDeleteFlag, 0));

        if (productionOrder != null) {
            fillStyleCover(List.of(productionOrder));
            fillCuttingSummary(List.of(productionOrder));
            fillCurrentProcessName(List.of(productionOrder));
            fillStockSummary(List.of(productionOrder));
            fillFlowStageFields(List.of(productionOrder));
            fixProductionProgressByCompletedQuantity(List.of(productionOrder));
            fillFactoryUnitPrice(List.of(productionOrder));
            fillQuotationUnitPrice(List.of(productionOrder));
        }

        return productionOrder;
    }

    private void fillFactoryUnitPrice(List<ProductionOrder> records) {
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

    private void fillQuotationUnitPrice(List<ProductionOrder> records) {
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

    private void fillStockSummary(List<ProductionOrder> records) {
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

        Map<String, Integer> inAgg = new HashMap<>();
        try {
            List<ProductWarehousing> list = productWarehousingMapper
                    .selectList(new LambdaQueryWrapper<ProductWarehousing>()
                            .select(ProductWarehousing::getOrderId, ProductWarehousing::getQualifiedQuantity)
                            .in(ProductWarehousing::getOrderId, orderIds)
                            .eq(ProductWarehousing::getDeleteFlag, 0));
            if (list != null) {
                for (ProductWarehousing w : list) {
                    if (w == null || !StringUtils.hasText(w.getOrderId())) {
                        continue;
                    }
                    String oid = w.getOrderId().trim();
                    int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                    if (q <= 0) {
                        continue;
                    }
                    inAgg.put(oid, inAgg.getOrDefault(oid, 0) + q);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to aggregate warehousing quantities for orders: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(),
                    e);
        }

        Map<String, Integer> outAgg = new HashMap<>();
        try {
            List<ProductOutstock> list = productOutstockMapper.selectList(new LambdaQueryWrapper<ProductOutstock>()
                    .select(ProductOutstock::getOrderId, ProductOutstock::getOutstockQuantity)
                    .in(ProductOutstock::getOrderId, orderIds)
                    .eq(ProductOutstock::getDeleteFlag, 0));
            if (list != null) {
                for (ProductOutstock o : list) {
                    if (o == null || !StringUtils.hasText(o.getOrderId())) {
                        continue;
                    }
                    String oid = o.getOrderId().trim();
                    int q = o.getOutstockQuantity() == null ? 0 : o.getOutstockQuantity();
                    if (q <= 0) {
                        continue;
                    }
                    outAgg.put(oid, outAgg.getOrDefault(oid, 0) + q);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to aggregate outstock quantities for orders: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(),
                    e);
        }

        for (ProductionOrder o : records) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            String oid = o.getId().trim();
            int in = Math.max(0, inAgg.getOrDefault(oid, 0));
            int out = Math.max(0, outAgg.getOrDefault(oid, 0));
            o.setWarehousingQualifiedQuantity(in);
            o.setOutstockQuantity(out);
            o.setInStockQuantity(Math.max(0, in - out));
        }
    }

    private void fixProductionProgressByCompletedQuantity(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        for (ProductionOrder o : records) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }

            String status = o.getStatus() == null ? "" : o.getStatus().trim();
            if ("completed".equalsIgnoreCase(status)) {
                continue;
            }

            int orderQty = o.getOrderQuantity() == null ? 0 : o.getOrderQuantity();
            if (orderQty <= 0) {
                continue;
            }

            int doneQty = o.getCompletedQuantity() == null ? 0 : o.getCompletedQuantity();
            if (doneQty <= 0) {
                continue;
            }

            int expected = scanRecordDomainService.clampPercent((int) Math.round(doneQty * 100.0 / orderQty));
            int current = o.getProductionProgress() == null ? 0 : o.getProductionProgress();
            if (expected == current) {
                continue;
            }
            if (expected < current) {
                continue;
            }

            o.setProductionProgress(expected);
        }
    }

    private void fillCurrentProcessName(List<ProductionOrder> records) {
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

        Map<String, LinkedHashMap<String, Long>> doneByOrder = new HashMap<>();
        boolean doneAggOk = false;
        try {
            List<Map<String, Object>> rows = scanRecordMapper.selectStageDoneAgg(orderIds);
            Map<String, List<Object[]>> tmp = new HashMap<>();
            if (rows != null) {
                for (Map<String, Object> row : rows) {
                    if (row == null || row.isEmpty()) {
                        continue;
                    }
                    String orderId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                    String stageName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "stageName"));
                    long doneQuantity = toLongSafe(ParamUtils.getIgnoreCase(row, "doneQuantity"));
                    LocalDateTime lastScanTime = toLocalDateTime(ParamUtils.getIgnoreCase(row, "lastScanTime"));
                    if (!StringUtils.hasText(orderId) || !StringUtils.hasText(stageName) || doneQuantity <= 0) {
                        continue;
                    }
                    tmp.computeIfAbsent(orderId.trim(), k -> new ArrayList<>())
                            .add(new Object[] { stageName.trim(), doneQuantity, lastScanTime });
                }
            }

            for (Map.Entry<String, List<Object[]>> e : tmp.entrySet()) {
                if (e == null || !StringUtils.hasText(e.getKey()) || e.getValue() == null) {
                    continue;
                }
                List<Object[]> list = e.getValue();
                list.sort((a, b) -> {
                    LocalDateTime ta = a == null ? null : (LocalDateTime) a[2];
                    LocalDateTime tb = b == null ? null : (LocalDateTime) b[2];
                    if (ta == null && tb == null) {
                        return 0;
                    }
                    if (ta == null) {
                        return 1;
                    }
                    if (tb == null) {
                        return -1;
                    }
                    return ta.compareTo(tb);
                });

                LinkedHashMap<String, Long> byStage = new LinkedHashMap<>();
                for (Object[] r : list) {
                    if (r == null) {
                        continue;
                    }
                    String stageName = r[0] == null ? null : String.valueOf(r[0]).trim();
                    long q = r[1] instanceof Number n ? n.longValue() : 0L;
                    if (!StringUtils.hasText(stageName) || q <= 0) {
                        continue;
                    }
                    byStage.put(stageName, byStage.getOrDefault(stageName, 0L) + q);
                }
                doneByOrder.put(e.getKey().trim(), byStage);
            }
            doneAggOk = true;
        } catch (Exception e) {
            log.warn("Failed to query stage done aggregation for current process name: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(),
                    e);
        }

        if (!doneAggOk) {
            List<ScanRecord> scanRecords;
            try {
                scanRecords = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                        .in(ScanRecord::getOrderId, orderIds)
                        .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting"))
                        .eq(ScanRecord::getScanResult, "success")
                        .orderByAsc(ScanRecord::getScanTime)
                        .orderByAsc(ScanRecord::getCreateTime));
            } catch (Exception e) {
                log.warn("Failed to query scan records for current process name: orderIdsCount={}",
                        orderIds == null ? 0 : orderIds.size(),
                        e);
                scanRecords = new ArrayList<>();
            }

            if (scanRecords != null) {
                for (ScanRecord r : scanRecords) {
                    if (r == null) {
                        continue;
                    }
                    String oid = r.getOrderId();
                    if (!StringUtils.hasText(oid)) {
                        continue;
                    }
                    String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                    if (!StringUtils.hasText(pn)) {
                        pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                    }
                    if (!StringUtils.hasText(pn)) {
                        continue;
                    }
                    int q = r.getQuantity() == null ? 0 : r.getQuantity();
                    if (q <= 0) {
                        continue;
                    }
                    LinkedHashMap<String, Long> byProc = doneByOrder.computeIfAbsent(oid.trim(),
                            k -> new LinkedHashMap<>());
                    byProc.put(pn, byProc.getOrDefault(pn, 0L) + q);
                }
            }
        }

        applyCurrentProcessName(records, doneByOrder);
    }

    private void applyCurrentProcessName(List<ProductionOrder> records,
            Map<String, LinkedHashMap<String, Long>> doneByOrder) {
        Map<String, List<String>> processOrderByStyleNo = new HashMap<>();
        try {
            Set<String> styleNos = records.stream()
                    .map(r -> r == null ? null : r.getStyleNo())
                    .filter(StringUtils::hasText)
                    .map(String::trim)
                    .collect(Collectors.toSet());
            for (String sn : styleNos) {
                List<String> processOrder = new ArrayList<>();
                try {
                    templateLibraryService.loadProgressWeights(sn, new LinkedHashMap<>(), processOrder);
                } catch (Exception e) {
                    log.warn("Failed to load progress weights from template: styleNo={}", sn, e);
                    processOrder = Collections.emptyList();
                }
                processOrderByStyleNo.put(sn, processOrder);
            }
        } catch (Exception e) {
            log.warn("Failed to prepare progress weights cache for current process name", e);
        }

        for (ProductionOrder order : records) {
            if (order == null || !StringUtils.hasText(order.getId())) {
                continue;
            }
            String oid = order.getId().trim();
            int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();

            String sn = StringUtils.hasText(order.getStyleNo()) ? order.getStyleNo().trim() : null;
            List<String> processOrder = sn == null ? Collections.emptyList()
                    : processOrderByStyleNo.getOrDefault(sn,
                            Collections.emptyList());

            List<String> productionProcesses = new ArrayList<>();
            if (!processOrder.isEmpty()) {
                for (String p : processOrder) {
                    String pn = p == null ? "" : p.trim();
                    if (!StringUtils.hasText(pn)) {
                        continue;
                    }
                    if (isBaseStageName(pn)) {
                        continue;
                    }
                    productionProcesses.add(pn);
                }
            }

            LinkedHashMap<String, Long> byProc = doneByOrder == null ? new LinkedHashMap<>()
                    : doneByOrder.getOrDefault(oid, new LinkedHashMap<>());
            boolean realStarted = false;
            boolean stageStarted = false;
            if (!byProc.isEmpty()) {
                for (Map.Entry<String, Long> e : byProc.entrySet()) {
                    if (e == null) {
                        continue;
                    }
                    String pn = e.getKey();
                    pn = pn == null ? null : pn.trim();
                    if (!StringUtils.hasText(pn)) {
                        continue;
                    }
                    if (!stageStarted && isBaseStageName(pn)) {
                        long v = e.getValue() == null ? 0L : e.getValue();
                        if (v > 0) {
                            stageStarted = true;
                        }
                    }
                    if (isBaseStageName(pn)) {
                        continue;
                    }
                    long v = e.getValue() == null ? 0L : e.getValue();
                    if (v > 0) {
                        realStarted = true;
                        break;
                    }
                }
            }
            if (productionProcesses.isEmpty() && !byProc.isEmpty()) {
                productionProcesses = new ArrayList<>();
                for (String pn : byProc.keySet()) {
                    String p = pn == null ? null : pn.trim();
                    if (!StringUtils.hasText(p)) {
                        continue;
                    }
                    if (isBaseStageName(p)) {
                        continue;
                    }
                    productionProcesses.add(p);
                }
            }

            if (productionProcesses.isEmpty()) {
                order.setCurrentProcessName(null);
                continue;
            }

            int currentIdx = -1;
            for (int i = 0; i < productionProcesses.size(); i++) {
                String pn = productionProcesses.get(i);
                long done = sumDoneByStageName(byProc, pn);
                if (orderQty > 0) {
                    if (done < orderQty) {
                        currentIdx = i;
                        break;
                    }
                } else {
                    if (done <= 0) {
                        currentIdx = i;
                        break;
                    }
                }
            }
            if (currentIdx < 0) {
                currentIdx = productionProcesses.size() - 1;
            }
            order.setCurrentProcessName(productionProcesses.get(currentIdx));

            String st = order.getStatus() == null ? "" : order.getStatus().trim();
            if (!"completed".equals(st) && (realStarted || stageStarted)) {
                order.setStatus("production");
            }
        }
    }

    private long sumDoneByStageName(Map<String, Long> doneByProcess, String stageName) {
        if (doneByProcess == null || doneByProcess.isEmpty() || !StringUtils.hasText(stageName)) {
            return 0L;
        }
        long sum = 0L;
        for (Map.Entry<String, Long> e : doneByProcess.entrySet()) {
            if (e == null) {
                continue;
            }
            String k = e.getKey();
            if (!templateLibraryService.progressStageNameMatches(stageName, k)) {
                continue;
            }
            long v = e.getValue() == null ? 0L : e.getValue();
            if (v > 0) {
                sum += v;
            }
        }
        return sum;
    }

    private boolean isBaseStageName(String processName) {
        String pn = StringUtils.hasText(processName) ? processName.trim() : null;
        if (!StringUtils.hasText(pn)) {
            return false;
        }
        return templateLibraryService
                .progressStageNameMatches(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED, pn)
                || templateLibraryService
                        .progressStageNameMatches(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT, pn);
    }

    private void fillFlowStageFields(List<ProductionOrder> records) {
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

        boolean flowSnapshotOk = false;
        List<Map<String, Object>> flowRows = null;
        try {
            flowRows = scanRecordMapper.selectFlowStageSnapshot(orderIds);
            flowSnapshotOk = true;
        } catch (Exception e) {
            log.warn("Failed to query flow stage snapshot: orderIdsCount={}", orderIds.size(), e);
        }

        boolean procurementSnapshotOk = false;
        List<Map<String, Object>> procurementRows = null;
        try {
            procurementRows = materialPurchaseMapper.selectProcurementSnapshot(orderIds);
            procurementSnapshotOk = true;
        } catch (Exception e) {
            log.warn("Failed to query procurement snapshot: orderIdsCount={}", orderIds.size(), e);
        }

        Map<String, Map<String, Object>> procurementByOrder = new HashMap<>();
        if (procurementRows != null) {
            for (Map<String, Object> row : procurementRows) {
                if (row == null || row.isEmpty()) {
                    continue;
                }
                String oid = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                if (!StringUtils.hasText(oid)) {
                    continue;
                }
                procurementByOrder.put(oid.trim(), row);
            }
        }

        if (flowSnapshotOk) {
            Map<String, Map<String, Object>> flowByOrder = new HashMap<>();
            if (flowRows != null) {
                for (Map<String, Object> row : flowRows) {
                    if (row == null || row.isEmpty()) {
                        continue;
                    }
                    String oid = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                    if (!StringUtils.hasText(oid)) {
                        continue;
                    }
                    flowByOrder.put(oid.trim(), row);
                }
            }

            for (ProductionOrder o : records) {
                if (o == null || !StringUtils.hasText(o.getId())) {
                    continue;
                }
                String oid = o.getId().trim();

                Map<String, Object> flow = flowByOrder.get(oid);
                Map<String, Object> proc = procurementByOrder.get(oid);

                LocalDateTime orderStart = o.getCreateTime();
                LocalDateTime orderEnd = orderStart;
                String orderOperator = null;
                Integer orderRate = 100;
                if (flow != null) {
                    LocalDateTime os = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "orderStartTime"));
                    LocalDateTime oe = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "orderEndTime"));
                    if (os != null) {
                        orderStart = os;
                        orderEnd = oe == null ? os : oe;
                        orderOperator = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "orderOperatorName"));
                    }
                }

                LocalDateTime procurementStart = null;
                LocalDateTime procurementEnd = null;
                String procurementOperator = null;
                Integer procurementRateFromPurchases = null;
                if (proc != null) {
                    procurementStart = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementStartTime"));
                    procurementEnd = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementEndTime"));
                    procurementOperator = ParamUtils
                            .toTrimmedString(ParamUtils.getIgnoreCase(proc, "procurementOperatorName"));
                    long purchaseQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "purchaseQuantity"));
                    long arrivedQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "arrivedQuantity"));
                    if (purchaseQty > 0) {
                        procurementRateFromPurchases = (int) Math.round(Math.max(0L, arrivedQty) * 100.0 / purchaseQty);
                    } else {
                        procurementRateFromPurchases = 0;
                    }
                } else if (flow != null) {
                    procurementEnd = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "procurementScanEndTime"));
                    procurementOperator = ParamUtils
                            .toTrimmedString(ParamUtils.getIgnoreCase(flow, "procurementScanOperatorName"));
                }

                LocalDateTime cuttingStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "cuttingStartTime"));
                LocalDateTime cuttingEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "cuttingEndTime"));
                String cuttingOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "cuttingOperatorName"));
                int cuttingQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "cuttingQuantity"));

                LocalDateTime sewingStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "sewingStartTime"));
                LocalDateTime sewingEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "sewingEndTime"));
                String sewingOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "sewingOperatorName"));

                LocalDateTime qualityStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "qualityStartTime"));
                LocalDateTime qualityEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "qualityEndTime"));
                String qualityOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "qualityOperatorName"));
                int qualityQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "qualityQuantity"));

                LocalDateTime wareStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "warehousingStartTime"));
                LocalDateTime wareEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "warehousingEndTime"));
                String wareOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "warehousingOperatorName"));
                int wareQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "warehousingQuantity"));

                o.setOrderStartTime(orderStart);
                o.setOrderEndTime(orderEnd);
                o.setOrderOperatorName(orderOperator);
                o.setOrderCompletionRate(orderRate);

                o.setProcurementStartTime(procurementStart);
                o.setProcurementEndTime(procurementEnd);
                o.setProcurementOperatorName(procurementOperator);
                Integer procurementRate;
                if (o.getMaterialArrivalRate() != null) {
                    procurementRate = scanRecordDomainService.clampPercent(o.getMaterialArrivalRate());
                } else if (procurementRateFromPurchases != null) {
                    procurementRate = scanRecordDomainService.clampPercent(procurementRateFromPurchases);
                } else {
                    procurementRate = 0;
                }
                o.setProcurementCompletionRate(procurementRate);

                o.setCuttingStartTime(cuttingStart);
                o.setCuttingEndTime(cuttingEnd);
                o.setCuttingOperatorName(cuttingOperator);
                int cuttingQtyForRate = o.getCuttingQuantity() == null ? cuttingQty : o.getCuttingQuantity();
                Integer cuttingRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, cuttingQtyForRate) * 100.0 / o.getOrderQuantity()));
                o.setCuttingCompletionRate(cuttingRate);

                o.setSewingStartTime(sewingStart);
                o.setSewingEndTime(sewingEnd);
                o.setSewingOperatorName(sewingOperator);
                int wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? wareQty
                        : o.getWarehousingQualifiedQuantity();
                Integer sewingRate = (cuttingQtyForRate <= 0) ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, wareQtyForRate) * 100.0 / Math.max(1, cuttingQtyForRate)));
                o.setSewingCompletionRate(sewingRate);

                o.setQualityStartTime(qualityStart);
                o.setQualityEndTime(qualityEnd);
                o.setQualityOperatorName(qualityOperator);
                Integer qualityRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                        : scanRecordDomainService
                                .clampPercent((int) Math.round(qualityQty * 100.0 / o.getOrderQuantity()));
                o.setQualityCompletionRate(qualityRate);

                o.setWarehousingStartTime(wareStart);
                o.setWarehousingEndTime(wareEnd);
                o.setWarehousingOperatorName(wareOperator);
                wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? wareQty
                        : o.getWarehousingQualifiedQuantity();
                Integer wareRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, wareQtyForRate) * 100.0 / o.getOrderQuantity()));
                o.setWarehousingCompletionRate(wareRate);
            }
            return;
        }

        List<ScanRecord> scans;
        try {
            scans = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getOrderId, ScanRecord::getScanType, ScanRecord::getProgressStage,
                            ScanRecord::getProcessName, ScanRecord::getProcessCode, ScanRecord::getQuantity,
                            ScanRecord::getScanTime, ScanRecord::getOperatorName, ScanRecord::getCreateTime)
                    .in(ScanRecord::getOrderId, orderIds)
                    .in(ScanRecord::getScanType,
                            java.util.Arrays.asList("production", "cutting", "quality", "warehouse"))
                    .eq(ScanRecord::getScanResult, "success")
                    .orderByAsc(ScanRecord::getScanTime)
                    .orderByAsc(ScanRecord::getCreateTime));
        } catch (Exception e) {
            log.warn("Failed to query scan records for flow stage fields: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(),
                    e);
            scans = new ArrayList<>();
        }

        Map<String, List<ScanRecord>> byOrder = new HashMap<>();
        if (scans != null) {
            for (ScanRecord r : scans) {
                if (r == null || !StringUtils.hasText(r.getOrderId())) {
                    continue;
                }
                String oid = r.getOrderId().trim();
                byOrder.computeIfAbsent(oid, k -> new ArrayList<>()).add(r);
            }
        }

        Map<String, List<MaterialPurchase>> purchasesByOrder = new HashMap<>();
        if (!procurementSnapshotOk) {
            try {
                List<MaterialPurchase> purchases = materialPurchaseMapper
                        .selectList(new LambdaQueryWrapper<MaterialPurchase>()
                                .in(MaterialPurchase::getOrderId, orderIds)
                                .eq(MaterialPurchase::getDeleteFlag, 0)
                                .orderByAsc(MaterialPurchase::getReceivedTime)
                                .orderByAsc(MaterialPurchase::getUpdateTime));
                if (purchases != null) {
                    for (MaterialPurchase p : purchases) {
                        if (p == null || !StringUtils.hasText(p.getOrderId())) {
                            continue;
                        }
                        purchasesByOrder.computeIfAbsent(p.getOrderId().trim(), k -> new ArrayList<>()).add(p);
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to query purchases for flow stage fields: orderIdsCount={}", orderIds.size(), e);
            }
        }

        for (ProductionOrder o : records) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            String oid = o.getId().trim();
            List<ScanRecord> list = byOrder.getOrDefault(oid, new ArrayList<>());

            LocalDateTime orderStart = o.getCreateTime();
            LocalDateTime orderEnd = orderStart;
            String orderOperator = null;
            Integer orderRate = 100;

            LocalDateTime procurementStart = null, procurementEnd = null;
            String procurementOperator = null;
            int procurementStageQty = 0;
            Integer procurementRateFromPurchases = null;

            LocalDateTime cuttingStart = null, cuttingEnd = null;
            String cuttingOperator = null;
            int cuttingQty = 0;

            LocalDateTime sewingStart = null, sewingEnd = null;
            String sewingOperator = null;

            LocalDateTime qualityStart = null, qualityEnd = null;
            String qualityOperator = null;
            int qualityQty = 0;

            LocalDateTime wareStart = null, wareEnd = null;
            String wareOperator = null;
            int wareQty = 0;

            for (ScanRecord r : list) {
                String st = r.getScanType() == null ? "" : r.getScanType().trim();
                String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                if (!StringUtils.hasText(pn)) {
                    pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                }
                String pc = r.getProcessCode() == null ? "" : r.getProcessCode().trim();
                int q = r.getQuantity() == null ? 0 : r.getQuantity();
                LocalDateTime t = r.getScanTime();
                String op = r.getOperatorName();

                if ("production".equals(st)
                        && templateLibraryService.progressStageNameMatches(
                                ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED,
                                pn)) {
                    orderStart = t;
                    orderEnd = t;
                    orderOperator = op;
                    orderRate = 100;
                } else if ("production".equals(st)
                        && templateLibraryService.progressStageNameMatches(
                                ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT,
                                pn)) {
                    procurementEnd = t;
                    procurementOperator = op;
                    procurementStageQty = Math.max(procurementStageQty, Math.max(0, q));
                } else if ("quality".equals(st)
                        || "quality_warehousing".equals(pc)
                        || ("production".equals(st) && templateLibraryService.isProgressQualityStageName(pn))) {
                    if (qualityStart == null) {
                        qualityStart = t;
                    }
                    qualityEnd = t;
                    qualityOperator = op;
                    qualityQty += Math.max(0, q);
                } else if ("warehouse".equals(st) && !"warehouse_rollback".equals(pc)) {
                    if (wareStart == null) {
                        wareStart = t;
                    }
                    wareEnd = t;
                    wareOperator = op;
                    wareQty += Math.max(0, q);
                } else if ("cutting".equals(st)) {
                    if (cuttingStart == null) {
                        cuttingStart = t;
                    }
                    cuttingEnd = t;
                    cuttingOperator = op;
                    cuttingQty += Math.max(0, q);
                } else if ("production".equals(st)
                        && !isBaseStageName(pn)
                        && !"quality_warehousing".equals(pc)
                        && !templateLibraryService.isProgressQualityStageName(pn)) {
                    if (sewingStart == null) {
                        sewingStart = t;
                    }
                    sewingEnd = t;
                    sewingOperator = op;
                }
            }

            if (procurementSnapshotOk) {
                Map<String, Object> proc = procurementByOrder.get(oid);
                if (proc != null) {
                    procurementStart = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementStartTime"));
                    procurementEnd = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementEndTime"));
                    procurementOperator = ParamUtils
                            .toTrimmedString(ParamUtils.getIgnoreCase(proc, "procurementOperatorName"));
                    long purchaseQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "purchaseQuantity"));
                    long arrivedQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "arrivedQuantity"));
                    if (purchaseQty > 0) {
                        procurementRateFromPurchases = (int) Math
                                .round(Math.max(0L, arrivedQty) * 100.0 / purchaseQty);
                    } else {
                        procurementRateFromPurchases = 0;
                    }
                }
            } else {
                try {
                    List<MaterialPurchase> purchases = purchasesByOrder.getOrDefault(oid, new ArrayList<>());
                    if (!purchases.isEmpty()) {
                        MaterialPurchaseService.ArrivalStats purchaseStats = materialPurchaseService
                                .computeArrivalStats(purchases);
                        procurementRateFromPurchases = purchaseStats == null ? 0 : purchaseStats.getArrivalRate();

                        for (MaterialPurchase p : purchases) {
                            if (p == null) {
                                continue;
                            }
                            LocalDateTime s = p.getCreateTime();
                            if (s != null && (procurementStart == null || s.isBefore(procurementStart))) {
                                procurementStart = s;
                            }

                            LocalDateTime t = p.getReceivedTime() == null ? p.getUpdateTime() : p.getReceivedTime();
                            if (t != null && (procurementEnd == null || t.isAfter(procurementEnd))) {
                                procurementEnd = t;
                                procurementOperator = p.getReceiverName();
                            }
                        }
                    }
                } catch (Exception e) {
                    log.warn("Failed to compute procurement summary from purchases: orderId={}", oid, e);
                }
            }

            o.setOrderStartTime(orderStart);
            o.setOrderEndTime(orderEnd);
            o.setOrderOperatorName(orderOperator);
            o.setOrderCompletionRate(orderRate);

            o.setProcurementStartTime(procurementStart);
            o.setProcurementEndTime(procurementEnd);
            o.setProcurementOperatorName(procurementOperator);
            Integer procurementRate;
            if (o.getMaterialArrivalRate() != null) {
                procurementRate = scanRecordDomainService.clampPercent(o.getMaterialArrivalRate());
            } else if (procurementRateFromPurchases != null) {
                procurementRate = scanRecordDomainService.clampPercent(procurementRateFromPurchases);
            } else {
                procurementRate = 0;
            }
            o.setProcurementCompletionRate(procurementRate);

            o.setCuttingStartTime(cuttingStart);
            o.setCuttingEndTime(cuttingEnd);
            o.setCuttingOperatorName(cuttingOperator);
            int cuttingQtyForRate = o.getCuttingQuantity() == null ? cuttingQty : o.getCuttingQuantity();
            Integer cuttingRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round(Math.max(0, cuttingQtyForRate) * 100.0 / o.getOrderQuantity()));
            o.setCuttingCompletionRate(cuttingRate);

            o.setSewingStartTime(sewingStart);
            o.setSewingEndTime(sewingEnd);
            o.setSewingOperatorName(sewingOperator);
            int wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? wareQty
                    : o.getWarehousingQualifiedQuantity();
            Integer sewingRate = (cuttingQtyForRate <= 0) ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round(Math.max(0, wareQtyForRate) * 100.0 / Math.max(1, cuttingQtyForRate)));
            o.setSewingCompletionRate(sewingRate);

            o.setQualityStartTime(qualityStart);
            o.setQualityEndTime(qualityEnd);
            o.setQualityOperatorName(qualityOperator);
            Integer qualityRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                    : scanRecordDomainService.clampPercent((int) Math.round(qualityQty * 100.0 / o.getOrderQuantity()));
            o.setQualityCompletionRate(qualityRate);

            o.setWarehousingStartTime(wareStart);
            o.setWarehousingEndTime(wareEnd);
            o.setWarehousingOperatorName(wareOperator);
            wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? wareQty
                    : o.getWarehousingQualifiedQuantity();
            Integer wareRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round(Math.max(0, wareQtyForRate) * 100.0 / o.getOrderQuantity()));
            o.setWarehousingCompletionRate(wareRate);
        }
    }

    private static long toLongSafe(Object v) {
        if (v == null) {
            return 0L;
        }
        if (v instanceof Number number) {
            return number.longValue();
        }
        String s = String.valueOf(v);
        if (!StringUtils.hasText(s)) {
            return 0L;
        }
        try {
            return new java.math.BigDecimal(s.trim()).setScale(0, java.math.RoundingMode.HALF_UP).longValue();
        } catch (Exception e) {
            return 0L;
        }
    }

    private static LocalDateTime toLocalDateTime(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof LocalDateTime time) {
            return time;
        }
        if (v instanceof java.sql.Timestamp timestamp) {
            return timestamp.toLocalDateTime();
        }
        return null;
    }

    private void fillStyleCover(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Set<String> styleNos = records.stream()
                .map(ProductionOrder::getStyleNo)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (styleNos.isEmpty()) {
            return;
        }

        List<StyleInfo> styles = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                .in(StyleInfo::getStyleNo, styleNos)
                .eq(StyleInfo::getStatus, "ENABLED"));

        Map<String, String> coverMap = new HashMap<>();
        if (styles != null) {
            for (StyleInfo s : styles) {
                if (s != null && StringUtils.hasText(s.getStyleNo())) {
                    coverMap.put(s.getStyleNo(), s.getCover());
                }
            }
        }

        for (ProductionOrder order : records) {
            if (order == null) {
                continue;
            }
            if (StringUtils.hasText(order.getStyleNo())) {
                order.setStyleCover(coverMap.get(order.getStyleNo()));
            }
        }
    }

    private void fillCuttingSummary(List<ProductionOrder> records) {
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

        List<Map<String, Object>> rows;
        try {
            QueryWrapper<CuttingBundle> qw = new QueryWrapper<CuttingBundle>()
                    .select("production_order_id as orderId", "COALESCE(SUM(quantity), 0) as totalQuantity",
                            "COUNT(1) as bundleCount")
                    .in("production_order_id", orderIds)
                    .groupBy("production_order_id");
            rows = cuttingBundleMapper.selectMaps(qw);
        } catch (Exception e) {
            log.warn("Failed to query cutting summary: orderIdsCount={}", orderIds == null ? 0 : orderIds.size(), e);
            return;
        }

        Map<String, int[]> agg = new HashMap<>();
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                if (row == null || row.isEmpty()) {
                    continue;
                }
                String orderId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                if (!StringUtils.hasText(orderId)) {
                    orderId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "productionOrderId"));
                }
                if (!StringUtils.hasText(orderId)) {
                    continue;
                }
                int totalQuantity = ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(row, "totalQuantity"));
                int bundleCount = ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(row, "bundleCount"));
                agg.put(orderId, new int[] { totalQuantity, bundleCount });
            }
        }

        for (ProductionOrder o : records) {
            if (o == null) {
                continue;
            }
            String oid = o.getId();
            if (!StringUtils.hasText(oid)) {
                continue;
            }
            int[] v = agg.get(oid.trim());
            if (v == null) {
                o.setCuttingQuantity(0);
                o.setCuttingBundleCount(0);
            } else {
                o.setCuttingQuantity(Math.max(0, v[0]));
                o.setCuttingBundleCount(Math.max(0, v[1]));
            }
        }
    }

}
