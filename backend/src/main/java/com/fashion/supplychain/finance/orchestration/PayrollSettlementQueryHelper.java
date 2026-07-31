package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class PayrollSettlementQueryHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    public PayrollSettlementQuery parseQuery(Map<String, Object> params, boolean includeProcessName, boolean includeSettledDefault) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);
        PayrollSettlementQuery q = new PayrollSettlementQuery();
        q.setOrderId(TextUtils.safeText(safeParams.get("orderId")));
        q.setOrderNo(TextUtils.safeText(safeParams.get("orderNo")));
        q.setStyleNo(TextUtils.safeText(safeParams.get("styleNo")));
        q.setOperatorId(TextUtils.safeText(safeParams.get("operatorId")));
        q.setOperatorName(TextUtils.safeText(safeParams.get("operatorName")));
        q.setScanType(TextUtils.safeText(safeParams.get("scanType")));
        q.setProcessName(includeProcessName ? TextUtils.safeText(safeParams.get("processName")) : null);
        q.setIncludeSettled(safeParams.containsKey("includeSettled")
                ? isTruthy(safeParams.get("includeSettled"))
                : includeSettledDefault);

        q.setStartTime(parseDateTime(safeParams.get("startTime")));
        q.setEndTime(parseDateTime(safeParams.get("endTime")));
        if (q.getStartTime() != null && q.getEndTime() != null && q.getEndTime().isBefore(q.getStartTime())) {
            LocalDateTime tmp = q.getStartTime();
            q.setStartTime(q.getEndTime());
            q.setEndTime(tmp);
        }

        if (!StringUtils.hasText(q.getOrderId()) && StringUtils.hasText(q.getOrderNo())) {
            ProductionOrder order = resolveOrder(q.getOrderId(), q.getOrderNo());
            if (order != null) {
                q.setOrderId(TextUtils.safeText(order.getId()));
                if (!StringUtils.hasText(q.getStyleNo())) {
                    q.setStyleNo(TextUtils.safeText(order.getStyleNo()));
                }
            }
        }

        return q;
    }

    public LocalDateTime parseDateTime(Object raw) {
        if (raw == null) {
            return null;
        }
        String v = TextUtils.safeText(String.valueOf(raw));
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            if (v.length() == 10) {
                LocalDate d = LocalDate.parse(v);
                return d.atTime(LocalTime.of(0, 0));
            }
        } catch (Exception e) {
            log.warn("Failed to parse date: value={}", v, e);
        }
        List<DateTimeFormatter> fmts = List.of(
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
                DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        for (DateTimeFormatter f : fmts) {
            try {
                return LocalDateTime.parse(v, f);
            } catch (Exception e) {
                log.warn("Failed to parse date with formatter: value={}, formatter={}", v, f, e);
            }
        }
        try {
            return LocalDateTime.parse(v);
        } catch (Exception e) {
            log.warn("Failed to parse date: value={}", v, e);
        }
        return null;
    }

    public ProductionOrder resolveOrder(String orderId, String orderNo) {
        String id = TextUtils.safeText(orderId);
        if (StringUtils.hasText(id)) {
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, id)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .one();
            if (order != null) {
                return order;
            }
        }
        String on = TextUtils.safeText(orderNo);
        if (!StringUtils.hasText(on)) {
            return null;
        }
        ProductionOrder order = productionOrderService
                .getOne(new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getOrderNo, on)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .last("limit 1"));
        if (order != null) {
            return order;
        }
        return null;
    }

    public static Integer toInt(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return number.intValue();
        }
        String v = TextUtils.safeText(String.valueOf(raw));
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            return Integer.parseInt(v);
        } catch (Exception e) {
            log.debug("[PayrollSettlement] parseInt failed: {}", v);
            return null;
        }
    }

    public static BigDecimal toBigDecimal(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof BigDecimal decimal) {
            return decimal;
        }
        if (raw instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        String v = TextUtils.safeText(String.valueOf(raw));
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            return new BigDecimal(v);
        } catch (Exception e) {
            log.debug("[PayrollSettlement] parseBigDecimal failed: {}", v);
            return null;
        }
    }

    // 使用TextUtils.safeText()替代

    public static boolean isTruthy(Object value) {
        String v = TextUtils.safeText(value);
        if (!StringUtils.hasText(v)) {
            return false;
        }
        String n = v.trim().toLowerCase();
        return "1".equals(n) || "true".equals(n) || "yes".equals(n) || "y".equals(n) || "on".equals(n);
    }
}
