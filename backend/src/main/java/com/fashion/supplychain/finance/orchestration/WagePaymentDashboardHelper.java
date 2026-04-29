package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.finance.service.WagePaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class WagePaymentDashboardHelper {

    private final WagePaymentService wagePaymentService;
    private final PayableService payableService;

    public Map<String, Object> getDashboardStats(String startDate, String endDate) {
        Long tenantId = TenantAssert.requireTenantIdOrSuperAdmin();
        if (tenantId == null) {
            return buildEmptyStats();
        }

        Map<String, Object> result = new LinkedHashMap<>();

        BigDecimal totalPaid = sumPaidAmount(tenantId, startDate, endDate);
        BigDecimal totalPending = sumPendingAmount(tenantId);
        BigDecimal totalReceived = sumReceivedAmount(tenantId, startDate, endDate);
        int overdueCount = countOverduePayables(tenantId);

        result.put("totalPaid", totalPaid);
        result.put("totalPending", totalPending);
        result.put("totalReceived", totalReceived);
        result.put("overdueCount", overdueCount);

        putTrendData(result, tenantId, startDate, endDate);

        return result;
    }

    private Map<String, Object> buildEmptyStats() {
        Map<String, Object> empty = new LinkedHashMap<>();
        empty.put("totalPaid", BigDecimal.ZERO);
        empty.put("totalPending", BigDecimal.ZERO);
        empty.put("totalReceived", BigDecimal.ZERO);
        empty.put("overdueCount", 0);
        empty.put("trendDates", java.util.Collections.emptyList());
        empty.put("trendPaid", java.util.Collections.emptyList());
        empty.put("trendReceived", java.util.Collections.emptyList());
        return empty;
    }

    private BigDecimal sumPaidAmount(Long tenantId, String startDate, String endDate) {
        try {
            LambdaQueryWrapper<WagePayment> qw = new LambdaQueryWrapper<>();
            qw.eq(WagePayment::getTenantId, tenantId)
              .eq(WagePayment::getStatus, "success")
              .ge(WagePayment::getCreateTime, startDate + " 00:00:00")
              .le(WagePayment::getCreateTime, endDate + " 23:59:59")
              .last("LIMIT 5000");
            List<WagePayment> payments = wagePaymentService.list(qw);
            return payments.stream()
                    .map(p -> p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[看板] 统计已付总额失败", e);
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal sumPendingAmount(Long tenantId) {
        try {
            LambdaQueryWrapper<WagePayment> qw = new LambdaQueryWrapper<>();
            qw.eq(WagePayment::getTenantId, tenantId)
              .eq(WagePayment::getStatus, "pending")
              .last("LIMIT 5000");
            List<WagePayment> payments = wagePaymentService.list(qw);
            return payments.stream()
                    .map(p -> p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[看板] 统计待付总额失败", e);
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal sumReceivedAmount(Long tenantId, String startDate, String endDate) {
        try {
            LambdaQueryWrapper<WagePayment> qw = new LambdaQueryWrapper<>();
            qw.eq(WagePayment::getTenantId, tenantId)
              .eq(WagePayment::getStatus, "received")
              .ge(WagePayment::getCreateTime, startDate + " 00:00:00")
              .le(WagePayment::getCreateTime, endDate + " 23:59:59")
              .last("LIMIT 5000");
            List<WagePayment> payments = wagePaymentService.list(qw);
            return payments.stream()
                    .map(p -> p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[看板] 统计已收总额失败", e);
            return BigDecimal.ZERO;
        }
    }

    private int countOverduePayables(Long tenantId) {
        try {
            LambdaQueryWrapper<Payable> qw = new LambdaQueryWrapper<>();
            qw.eq(Payable::getTenantId, tenantId)
              .eq(Payable::getDeleteFlag, 0)
              .eq(Payable::getStatus, "OVERDUE")
              .last("LIMIT 5000");
            return (int) payableService.count(qw);
        } catch (Exception e) {
            log.warn("[看板] 统计逾期笔数失败", e);
            return 0;
        }
    }

    private void putTrendData(Map<String, Object> result, Long tenantId, String startDate, String endDate) {
        List<String> trendDates = new ArrayList<>();
        List<BigDecimal> trendPaid = new ArrayList<>();
        List<BigDecimal> trendReceived = new ArrayList<>();

        try {
            LocalDate start = LocalDate.parse(startDate);
            LocalDate end = LocalDate.parse(endDate);

            Map<String, BigDecimal> paidByDay = new LinkedHashMap<>();
            Map<String, BigDecimal> receivedByDay = new LinkedHashMap<>();
            for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
                String key = d.format(DateTimeFormatter.ofPattern("MM-dd"));
                paidByDay.put(key, BigDecimal.ZERO);
                receivedByDay.put(key, BigDecimal.ZERO);
            }

            String dayStart = start.format(DateTimeFormatter.ISO_LOCAL_DATE) + " 00:00:00";
            String dayEnd = end.format(DateTimeFormatter.ISO_LOCAL_DATE) + " 23:59:59";

            aggregateDailyPaid(tenantId, dayStart, dayEnd, paidByDay);
            aggregateDailyReceived(tenantId, dayStart, dayEnd, receivedByDay);

            trendDates.addAll(paidByDay.keySet());
            trendPaid.addAll(paidByDay.values());
            trendReceived.addAll(receivedByDay.values());
        } catch (Exception e) {
            log.warn("[看板] 生成趋势数据失败", e);
        }

        result.put("trendDates", trendDates);
        result.put("trendPaid", trendPaid);
        result.put("trendReceived", trendReceived);
    }

    private void aggregateDailyPaid(Long tenantId, String dayStart, String dayEnd, Map<String, BigDecimal> paidByDay) {
        List<WagePayment> allPaidInPeriod = wagePaymentService.list(new LambdaQueryWrapper<WagePayment>()
                .eq(WagePayment::getTenantId, tenantId)
                .eq(WagePayment::getStatus, "success")
                .ge(WagePayment::getCreateTime, dayStart)
                .le(WagePayment::getCreateTime, dayEnd)
                .last("LIMIT 5000"));
        for (WagePayment p : allPaidInPeriod) {
            if (p.getCreateTime() != null) {
                String key = p.getCreateTime().format(DateTimeFormatter.ofPattern("MM-dd"));
                if (paidByDay.containsKey(key)) {
                    paidByDay.put(key, paidByDay.get(key).add(p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO));
                }
            }
        }
    }

    private void aggregateDailyReceived(Long tenantId, String dayStart, String dayEnd, Map<String, BigDecimal> receivedByDay) {
        List<WagePayment> allReceivedInPeriod = wagePaymentService.list(new LambdaQueryWrapper<WagePayment>()
                .eq(WagePayment::getTenantId, tenantId)
                .eq(WagePayment::getStatus, "received")
                .ge(WagePayment::getCreateTime, dayStart)
                .le(WagePayment::getCreateTime, dayEnd)
                .last("LIMIT 5000"));
        for (WagePayment p : allReceivedInPeriod) {
            if (p.getCreateTime() != null) {
                String key = p.getCreateTime().format(DateTimeFormatter.ofPattern("MM-dd"));
                if (receivedByDay.containsKey(key)) {
                    receivedByDay.put(key, receivedByDay.get(key).add(p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO));
                }
            }
        }
    }
}
