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

        Long tenantId = UserContext.tenantId();

        Map<String, Map<String, Integer>> aggregated = queryProcessScannedBundles(orderIds, tenantId);

        for (ProductionOrder o : records) {
            if (o == null) {
                continue;
            }
            String oid = o.getId();
            if (!StringUtils.hasText(oid)) {
                continue;
            }
            Map<String, Integer> processMap = aggregated.getOrDefault(oid.trim(), new HashMap<>());
            o.setStageScannedBundleCount(processMap);
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
