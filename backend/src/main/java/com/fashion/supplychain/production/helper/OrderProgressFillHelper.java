package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
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

    private boolean isDirectCuttingOrder(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getOrderNo())) {
            return false;
        }
        return order.getOrderNo().trim().toUpperCase().startsWith("CUT");
    }

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    public void fillCurrentProcessName(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();

        List<String> orderIds = records.stream()
                .map(r -> r == null ? null : r.getId())
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty()) {
            return;
        }

        Map<String, LinkedHashMap<String, Long>> doneByOrder = queryDoneByOrderAgg(orderIds, tenantId);
        if (doneByOrder.isEmpty()) {
            doneByOrder = queryDoneByOrderFallback(orderIds);
        }

        applyCurrentProcessName(records, doneByOrder);
    }

    private Map<String, LinkedHashMap<String, Long>> queryDoneByOrderAgg(List<String> orderIds, Long tenantId) {
        Map<String, LinkedHashMap<String, Long>> doneByOrder = new HashMap<>();
        try {
            List<Map<String, Object>> rows = scanRecordMapper.selectStageDoneAgg(orderIds, tenantId);
            Map<String, List<Object[]>> tmp = parseAggRows(rows);
            for (Map.Entry<String, List<Object[]>> e : tmp.entrySet()) {
                if (e == null || !StringUtils.hasText(e.getKey()) || e.getValue() == null) {
                    continue;
                }
                List<Object[]> list = e.getValue();
                list.sort((a, b) -> {
                    LocalDateTime ta = a == null ? null : (LocalDateTime) a[2];
                    LocalDateTime tb = b == null ? null : (LocalDateTime) b[2];
                    if (ta == null && tb == null) return 0;
                    if (ta == null) return 1;
                    if (tb == null) return -1;
                    return ta.compareTo(tb);
                });

                LinkedHashMap<String, Long> byStage = new LinkedHashMap<>();
                for (Object[] r : list) {
                    if (r == null) continue;
                    String stageName = r[0] == null ? null : String.valueOf(r[0]).trim();
                    long q = r[1] instanceof Number n ? n.longValue() : 0L;
                    if (!StringUtils.hasText(stageName) || q <= 0) continue;
                    byStage.put(stageName, byStage.getOrDefault(stageName, 0L) + q);
                }
                doneByOrder.put(e.getKey().trim(), byStage);
            }
        } catch (Exception e) {
            log.warn("Failed to query stage done aggregation for current process name: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(), e);
        }
        return doneByOrder;
    }

    private Map<String, List<Object[]>> parseAggRows(List<Map<String, Object>> rows) {
        Map<String, List<Object[]>> tmp = new HashMap<>();
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                if (row == null || row.isEmpty()) continue;
                String orderId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                String stageName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "stageName"));
                long doneQuantity = toLongSafe(ParamUtils.getIgnoreCase(row, "doneQuantity"));
                LocalDateTime lastScanTime = toLocalDateTime(ParamUtils.getIgnoreCase(row, "lastScanTime"));
                if (!StringUtils.hasText(orderId) || !StringUtils.hasText(stageName) || doneQuantity <= 0) continue;
                tmp.computeIfAbsent(orderId.trim(), k -> new ArrayList<>())
                        .add(new Object[]{stageName.trim(), doneQuantity, lastScanTime});
            }
        }
        return tmp;
    }

    private Map<String, LinkedHashMap<String, Long>> queryDoneByOrderFallback(List<String> orderIds) {
        Map<String, LinkedHashMap<String, Long>> doneByOrder = new HashMap<>();
        try {
            List<ScanRecord> scanRecords = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                    .in(ScanRecord::getOrderId, orderIds)
                    .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting"))
                    .eq(ScanRecord::getScanResult, "success")
                    .orderByAsc(ScanRecord::getScanTime)
                    .orderByAsc(ScanRecord::getCreateTime));
            if (scanRecords != null) {
                for (ScanRecord r : scanRecords) {
                    if (r == null) continue;
                    String oid = r.getOrderId();
                    if (!StringUtils.hasText(oid)) continue;
                    String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                    if (!StringUtils.hasText(pn)) {
                        pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                    }
                    if (!StringUtils.hasText(pn)) continue;
                    int q = r.getQuantity() == null ? 0 : r.getQuantity();
                    if (q <= 0) continue;
                    LinkedHashMap<String, Long> byProc = doneByOrder.computeIfAbsent(oid.trim(),
                            k -> new LinkedHashMap<>());
                    byProc.put(pn, byProc.getOrDefault(pn, 0L) + q);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query scan records for current process name: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(), e);
        }
        return doneByOrder;
    }

    private void applyCurrentProcessName(List<ProductionOrder> records,
            Map<String, LinkedHashMap<String, Long>> doneByOrder) {
        Map<String, List<String>> processOrderByStyleNo = loadProcessOrderByStyleNo(records);

        for (ProductionOrder order : records) {
            if (order == null || !StringUtils.hasText(order.getId())) {
                continue;
            }
            String oid = order.getId().trim();
            int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();

            String sn = StringUtils.hasText(order.getStyleNo()) ? order.getStyleNo().trim() : null;
            List<String> processOrder = sn == null ? Collections.emptyList()
                    : processOrderByStyleNo.getOrDefault(sn, Collections.emptyList());

            List<String> productionProcesses = filterProductionProcesses(processOrder);

            LinkedHashMap<String, Long> byProc = doneByOrder == null ? new LinkedHashMap<>()
                    : doneByOrder.getOrDefault(oid, new LinkedHashMap<>());
            boolean[] startedFlags = detectStartedFlags(byProc);
            boolean realStarted = startedFlags[0];
            boolean stageStarted = startedFlags[1];

            if (productionProcesses.isEmpty() && !byProc.isEmpty()) {
                productionProcesses = extractProductionProcessesFromDone(byProc);
            }

            if (productionProcesses.isEmpty()) {
                // 未开始生产的订单，默认显示为"采购"阶段（确保未扫码订单在移动端可见）
                order.setCurrentProcessName("采购");
                String st = order.getStatus() == null ? "" : order.getStatus().trim();
                if (!isTerminalStatus(st)) {
                    order.setStatus("pending");
                }
                continue;
            }

            if (isInProcurementStage(order, byProc, realStarted, stageStarted)) {
                order.setCurrentProcessName("采购");
                String st = order.getStatus() == null ? "" : order.getStatus().trim();
                if (!isTerminalStatus(st)) {
                    order.setStatus("production");
                }
                continue;
            }

            int currentIdx = locateCurrentProcessIndex(productionProcesses, byProc, orderQty);
            order.setCurrentProcessName(productionProcesses.get(currentIdx));

            String st = order.getStatus() == null ? "" : order.getStatus().trim();
            if (!isTerminalStatus(st) && (realStarted || stageStarted)) {
                order.setStatus("production");
            }
        }
    }

    private Map<String, List<String>> loadProcessOrderByStyleNo(List<ProductionOrder> records) {
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
        return processOrderByStyleNo;
    }

    private List<String> filterProductionProcesses(List<String> processOrder) {
        List<String> productionProcesses = new ArrayList<>();
        if (!processOrder.isEmpty()) {
            for (String p : processOrder) {
                String pn = p == null ? "" : p.trim();
                if (!StringUtils.hasText(pn) || isBaseStageName(pn)) {
                    continue;
                }
                productionProcesses.add(pn);
            }
        }
        return productionProcesses;
    }

    private boolean[] detectStartedFlags(LinkedHashMap<String, Long> byProc) {
        boolean realStarted = false;
        boolean stageStarted = false;
        if (!byProc.isEmpty()) {
            for (Map.Entry<String, Long> e : byProc.entrySet()) {
                if (e == null) continue;
                String pn = e.getKey() == null ? null : e.getKey().trim();
                if (!StringUtils.hasText(pn)) continue;
                if (!stageStarted && isBaseStageName(pn)) {
                    long v = e.getValue() == null ? 0L : e.getValue();
                    if (v > 0) stageStarted = true;
                }
                if (isBaseStageName(pn)) continue;
                long v = e.getValue() == null ? 0L : e.getValue();
                if (v > 0) { realStarted = true; break; }
            }
        }
        return new boolean[]{realStarted, stageStarted};
    }

    private List<String> extractProductionProcessesFromDone(LinkedHashMap<String, Long> byProc) {
        List<String> productionProcesses = new ArrayList<>();
        for (String pn : byProc.keySet()) {
            String p = pn == null ? null : pn.trim();
            if (!StringUtils.hasText(p) || isBaseStageName(p)) continue;
            productionProcesses.add(p);
        }
        return productionProcesses;
    }

    private boolean isInProcurementStage(ProductionOrder order, LinkedHashMap<String, Long> byProc,
                                          boolean realStarted, boolean stageStarted) {
        Integer materialArrivalRate = order.getMaterialArrivalRate();
        Integer manuallyCompleted = order.getProcurementManuallyCompleted();
        boolean isManuallyConfirmed = (manuallyCompleted != null && manuallyCompleted == 1);
        boolean directCuttingOrder = isDirectCuttingOrder(order);
        boolean hasConfirmedFabric = StringUtils.hasText(order.getId())
                && materialPurchaseService.hasConfirmedQuantityByOrderId(order.getId(), true);

        boolean procurementComplete = directCuttingOrder;
        if (!procurementComplete && hasConfirmedFabric) {
            procurementComplete = true;
        } else if (!procurementComplete && materialArrivalRate != null && materialArrivalRate >= 50 && isManuallyConfirmed) {
            procurementComplete = true;
        }

        if (procurementComplete) {
            return false;
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (byProc.containsKey("采购") || byProc.containsKey("物料采购")) {
            long procurementDone = sumDoneByStageName(byProc, "采购") + sumDoneByStageName(byProc, "物料采购");
            if (orderQty > 0 && procurementDone < orderQty) return true;
            if (orderQty <= 0 && procurementDone <= 0) return true;
        } else if (!realStarted && !stageStarted) {
            return true;
        } else {
            return true;
        }
        return false;
    }

    private int locateCurrentProcessIndex(List<String> productionProcesses, LinkedHashMap<String, Long> byProc, int orderQty) {
        int currentIdx = -1;
        for (int i = 0; i < productionProcesses.size(); i++) {
            String pn = productionProcesses.get(i);
            long done = sumDoneByStageName(byProc, pn);
            if (orderQty > 0) {
                if (done < orderQty) { currentIdx = i; break; }
            } else {
                if (done <= 0) { currentIdx = i; break; }
            }
        }
        if (currentIdx < 0) {
            currentIdx = productionProcesses.size() - 1;
        }
        return currentIdx;
    }

    private boolean isTerminalStatus(String status) {
        return OrderStatusConstants.isTerminal(status);
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
