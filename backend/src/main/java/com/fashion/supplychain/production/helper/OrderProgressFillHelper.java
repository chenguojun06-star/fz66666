package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
public class OrderProgressFillHelper {

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    public void fixProductionProgressByCompletedQuantity(List<ProductionOrder> records) {
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

    public void fillCurrentProcessName(List<ProductionOrder> records) {
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

            // 检查是否还在采购阶段
            boolean inProcurement = false;

            // 获取物料到货率和人工确认状态
            Integer materialArrivalRate = order.getMaterialArrivalRate();
            Integer manuallyCompleted = order.getProcurementManuallyCompleted();
            boolean isManuallyConfirmed = (manuallyCompleted != null && manuallyCompleted == 1);

            // 采购完成判断规则：
            // 1. 物料到货率=100%：自动认为采购完成
            // 2. 物料到货率≥50%且已人工确认：可以进入下一步
            // 3. 物料到货率<50%：必须停留在采购阶段，不允许人工确认
            boolean procurementComplete = false;
            if (materialArrivalRate != null && materialArrivalRate >= 100) {
                procurementComplete = true;
            } else if (materialArrivalRate != null && materialArrivalRate >= 50 && isManuallyConfirmed) {
                procurementComplete = true;
            }

            // 如果采购未完成，必须停留在采购阶段
            if (!procurementComplete) {
                if (byProc.containsKey("采购") || byProc.containsKey("物料采购")) {
                    long procurementDone = sumDoneByStageName(byProc, "采购") + sumDoneByStageName(byProc, "物料采购");
                    // 如果采购未完成（数量小于订单数量），说明还在采购阶段
                    if (orderQty > 0 && procurementDone < orderQty) {
                        inProcurement = true;
                    } else if (orderQty <= 0 && procurementDone <= 0) {
                        inProcurement = true;
                    }
                } else if (!realStarted && !stageStarted) {
                    // 如果没有任何扫码记录，也认为在采购阶段
                    inProcurement = true;
                } else {
                    // 默认情况：物料未完成且未确认，停留在采购阶段
                    inProcurement = true;
                }
            }

            if (inProcurement) {
                order.setCurrentProcessName("采购");
                String st = order.getStatus() == null ? "" : order.getStatus().trim();
                if (!"completed".equals(st)) {
                    order.setStatus("production");
                }
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
}
