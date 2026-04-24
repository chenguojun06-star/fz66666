package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class SalesForecastOrchestrator {

    @Autowired
    private ProductWarehousingMapper warehousingMapper;

    public SalesForecastResponse forecastSales(String styleNo, int horizonMonths) {
        TenantAssert.assertTenantContext();
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LocalDateTime start = LocalDateTime.now().minusMonths(6);
        List<ProductWarehousing> records = warehousingMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductWarehousing>()
                        .select("create_time", "qualified_quantity")
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0)
                        .eq("style_no", styleNo)
                        .ge("create_time", start)
                        .last("LIMIT 5000"));

        Map<String, Integer> monthlyQty = new LinkedHashMap<>();
        for (ProductWarehousing w : records) {
            String month = w.getCreateTime().getYear() + "-" + String.format("%02d", w.getCreateTime().getMonthValue());
            monthlyQty.merge(month, w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0, Integer::sum);
        }

        List<Integer> qtySeries = new ArrayList<>(monthlyQty.values());
        int predicted;
        int confidence;
        if (qtySeries.size() >= 3) {
            double[] weights = {0.2, 0.3, 0.5};
            double wma = 0;
            int startIdx = Math.max(0, qtySeries.size() - 3);
            for (int i = 0; i < 3 && startIdx + i < qtySeries.size(); i++) {
                wma += qtySeries.get(startIdx + i) * weights[i];
            }
            predicted = (int) Math.round(wma);
            confidence = 65;
        } else if (qtySeries.size() >= 1) {
            predicted = qtySeries.get(qtySeries.size() - 1);
            confidence = 45;
        } else {
            predicted = 0;
            confidence = 20;
        }

        SalesForecastResponse resp = new SalesForecastResponse();
        resp.setStyleNo(styleNo);
        resp.setHorizonMonths(horizonMonths);
        resp.setPredictedQty(predicted);
        resp.setConfidence(confidence);
        resp.setMonthlyHistory(monthlyQty);
        resp.setOptimistic((int) Math.round(predicted * 1.2));
        resp.setPessimistic((int) Math.round(predicted * 0.8));
        return resp;
    }

    public SizeCurveResponse forecastSizeCurve(String styleNo) {
        TenantAssert.assertTenantContext();
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LocalDateTime start = LocalDateTime.now().minusMonths(3);
        List<ProductWarehousing> records = warehousingMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductWarehousing>()
                        .select("size", "qualified_quantity")
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0)
                        .eq("style_no", styleNo)
                        .ge("create_time", start)
                        .last("LIMIT 5000"));

        Map<String, Integer> sizeQty = new LinkedHashMap<>();
        int total = 0;
        for (ProductWarehousing w : records) {
            String size = w.getSize();
            if (size == null || size.isEmpty()) continue;
            int qty = w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0;
            sizeQty.merge(size, qty, Integer::sum);
            total += qty;
        }

        Map<String, BigDecimal> sizeCurve = new LinkedHashMap<>();
        List<String> standardOrder = Arrays.asList("XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL",
                "XXS", "XXXL", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40");
        List<String> sortedSizes = sizeQty.keySet().stream()
                .sorted(Comparator.comparingInt(s -> {
                    int idx = standardOrder.indexOf(s.toUpperCase());
                    return idx >= 0 ? idx : 999;
                }))
                .collect(Collectors.toList());

        for (String size : sortedSizes) {
            int qty = sizeQty.get(size);
            BigDecimal pct = total > 0 ? BigDecimal.valueOf(qty).divide(BigDecimal.valueOf(total), 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100)).setScale(1, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            sizeCurve.put(size, pct);
        }

        SizeCurveResponse resp = new SizeCurveResponse();
        resp.setStyleNo(styleNo);
        resp.setSizeCurve(sizeCurve);
        resp.setSampleCount(records.size());
        resp.setConfidence(records.size() >= 30 ? 75 : records.size() >= 10 ? 55 : 30);
        return resp;
    }

    @Data
    public static class SalesForecastResponse {
        private String styleNo;
        private int horizonMonths;
        private int predictedQty;
        private int optimistic;
        private int pessimistic;
        private int confidence;
        private Map<String, Integer> monthlyHistory;
    }

    @Data
    public static class SizeCurveResponse {
        private String styleNo;
        private Map<String, BigDecimal> sizeCurve;
        private int sampleCount;
        private int confidence;
    }
}
