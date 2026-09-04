package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionProcessTrackingMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class OrderStageBundleStatsFillHelper {

    private final ProductionProcessTrackingMapper trackingMapper;

    @Autowired
    public OrderStageBundleStatsFillHelper(ProductionProcessTrackingMapper trackingMapper) {
        this.trackingMapper = trackingMapper;
    }

    public void fillStageBundleStats(List<ProductionOrder> records) {
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

        // 异步线程（CompletableFuture.runAsync）没有继承 UserContext ThreadLocal，
        // 优先从订单记录获取 tenantId，fallback 到 UserContext（同步调用场景）。
        Long tenantId = records.stream()
                .map(r -> r == null ? null : r.getTenantId())
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElse(UserContext.tenantId());
        if (tenantId == null) {
            log.warn("[StageBundleStats] fillStageBundleStats skipped: tenantId is null, recordCount={}", records.size());
            return;
        }

        Map<String, Map<String, Integer>> aggregated = queryProcessScannedBundles(orderIds, tenantId);
        Map<String, Map<String, Integer>> aggregatedQty = queryProcessScannedQty(orderIds, tenantId);

        for (ProductionOrder o : records) {
            if (o == null) {
                continue;
            }
            String oid = o.getId();
            if (!StringUtils.hasText(oid)) {
                continue;
            }
            o.setStageScannedBundleCount(aggregated.getOrDefault(oid.trim(), new HashMap<>()));
            o.setStageScannedBundleQty(aggregatedQty.getOrDefault(oid.trim(), new HashMap<>()));
        }
    }

    private Map<String, Map<String, Integer>> queryProcessScannedBundles(List<String> orderIds, Long tenantId) {
        Map<String, Map<String, Integer>> result = new HashMap<>();

        List<Map<String, Object>> rows;
        try {
            rows = trackingMapper.selectScannedBundleCountByOrderIds(orderIds, tenantId);
        } catch (Exception e) {
            log.warn("[StageBundleStats] query failed: orderIdsCount={}", orderIds.size(), e);
            return result;
        }

        if (rows == null || rows.isEmpty()) {
            return result;
        }

        for (Map<String, Object> row : rows) {
            if (row == null || row.isEmpty()) {
                continue;
            }
            String orderId = toTrimmed(row.get("orderId"));
            String processName = toTrimmed(row.get("processName"));
            int count = toInt(row.get("scannedBundleCount"));

            if (!StringUtils.hasText(orderId) || !StringUtils.hasText(processName)) {
                continue;
            }

            result.computeIfAbsent(orderId, k -> new HashMap<>()).put(processName, count);
        }

        return result;
    }

    /**
     * 每工序已扫码件数（SUM quantity），与菲号数查询同口径。
     * 手机端工序进度「件数」据此随扫码联动，不再依赖静态完成率。
     */
    private Map<String, Map<String, Integer>> queryProcessScannedQty(List<String> orderIds, Long tenantId) {
        Map<String, Map<String, Integer>> result = new HashMap<>();

        List<Map<String, Object>> rows;
        try {
            rows = trackingMapper.selectScannedBundleQtyByOrderIds(orderIds, tenantId);
        } catch (Exception e) {
            log.warn("[StageBundleStats] qty query failed: orderIdsCount={}", orderIds.size(), e);
            return result;
        }

        if (rows == null || rows.isEmpty()) {
            return result;
        }

        for (Map<String, Object> row : rows) {
            if (row == null || row.isEmpty()) {
                continue;
            }
            String orderId = toTrimmed(row.get("orderId"));
            String processName = toTrimmed(row.get("processName"));
            int qty = toInt(row.get("scannedQty"));

            if (!StringUtils.hasText(orderId) || !StringUtils.hasText(processName)) {
                continue;
            }

            result.computeIfAbsent(orderId, k -> new HashMap<>()).put(processName, qty);
        }

        return result;
    }

    private static String toTrimmed(Object val) {
        if (val == null) return "";
        String s = val.toString().trim();
        return s;
    }

    private static int toInt(Object val) {
        if (val == null) return 0;
        try {
            return Integer.parseInt(val.toString().trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
