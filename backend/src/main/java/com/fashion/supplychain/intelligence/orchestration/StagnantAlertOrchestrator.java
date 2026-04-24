package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.StagnantAlertResponse;
import com.fashion.supplychain.intelligence.dto.StagnantAlertResponse.StagnantOrderAlert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 扫码停滞自动预警引擎（B3）
 *
 * <p>算法：
 * 1. 加载所有进行中订单（production / cutting）
 * 2. 查询每个订单最后一次成功扫码时间
 * 3. 若最后扫码距今 ≥ STAGNANT_DAYS=3 天，则标记为停滞
 * 4. 根据停滞天数 × 交期紧迫度生成行动建议
 */
@Service
@Slf4j
public class StagnantAlertOrchestrator {

    private static final int STAGNANT_DAYS = 3;
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    public StagnantAlertResponse detect() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        StagnantAlertResponse response = new StagnantAlertResponse();

        // 1. 在手订单
        QueryWrapper<ProductionOrder> oqw = new QueryWrapper<>();
        oqw.eq("tenant_id", tenantId)
           .eq("delete_flag", 0)
           .in("status", "production", "cutting");
        List<ProductionOrder> orders = productionOrderMapper.selectList(oqw);
        response.setCheckedOrders(orders.size());

        if (orders.isEmpty()) {
            return response;
        }

        // 2. 最近扫码：每个 orderId 取最大 scan_time（最近3个月内）
        LocalDateTime since = LocalDateTime.now().minusMonths(3);
        List<String> orderIds = orders.stream().map(o -> String.valueOf(o.getId())).collect(Collectors.toList());

        // 分批查询（避免 IN 子句过长）
        Map<String, LocalDateTime> lastScanByOrder = new HashMap<>();
        int batchSize = 200;
        for (int i = 0; i < orderIds.size(); i += batchSize) {
            List<String> batch = orderIds.subList(i, Math.min(i + batchSize, orderIds.size()));
            QueryWrapper<ScanRecord> sqw = new QueryWrapper<>();
            sqw.eq("tenant_id", tenantId)
               .eq("scan_result", "success")
               .in("order_id", batch)
               .ge("scan_time", since)
               .orderByDesc("scan_time");
            List<ScanRecord> scans = scanRecordMapper.selectList(sqw);
            for (ScanRecord sr : scans) {
                if (sr.getOrderId() == null || sr.getScanTime() == null) continue;
                lastScanByOrder.merge(sr.getOrderId(), sr.getScanTime(),
                        (existing, candidate) -> existing.isAfter(candidate) ? existing : candidate);
            }
        }

        // 3. 判断停滞
        LocalDateTime now = LocalDateTime.now();
        List<StagnantOrderAlert> alerts = new ArrayList<>();
        for (ProductionOrder order : orders) {
            String oid = String.valueOf(order.getId());
            LocalDateTime lastScan = lastScanByOrder.get(oid);
            if (lastScan == null) continue; // 从未扫码的订单另行处理

            long staleDays = ChronoUnit.DAYS.between(lastScan, now);
            if (staleDays < STAGNANT_DAYS) continue;

            LocalDateTime plannedEnd = order.getPlannedEndDate();
            int daysToDeadline = plannedEnd != null
                    ? (int) ChronoUnit.DAYS.between(LocalDate.now(), plannedEnd.toLocalDate())
                    : 30;

            String severity;
            String advice;
            if (staleDays >= 7 || daysToDeadline <= 0) {
                severity = "urgent";
                advice = String.format("订单【%s】停滞 %d 天，交期%s，请立即联系工厂确认并安排抢工",
                        order.getOrderNo(), staleDays,
                        daysToDeadline <= 0 ? "已逾期" : "还剩" + daysToDeadline + "天");
            } else if (staleDays >= 4 || daysToDeadline <= 7) {
                severity = "alert";
                advice = String.format("订单【%s】停滞 %d 天，剩余 %d 天交期，建议今日跟进工厂状态",
                        order.getOrderNo(), staleDays, daysToDeadline);
            } else {
                severity = "watch";
                advice = String.format("订单【%s】已 %d 天无扫码记录，建议关注进度", order.getOrderNo(), staleDays);
            }

            int progress = order.getProductionProgress() == null ? 0 : order.getProductionProgress();

            StagnantOrderAlert alert = new StagnantOrderAlert();
            alert.setOrderId(oid);
            alert.setOrderNo(order.getOrderNo());
            alert.setStyleNo(order.getStyleNo());
            alert.setFactoryName(order.getFactoryName());
            alert.setLastScanTime(lastScan.format(DT_FMT));
            alert.setStagnantDays((int) staleDays);
            alert.setCurrentProgress(progress);
            alert.setPlannedEndDate(plannedEnd != null ? plannedEnd.format(DATE_FMT) : null);
            alert.setDaysToDeadline(daysToDeadline);
            alert.setSeverity(severity);
            alert.setActionAdvice(advice);
            alerts.add(alert);
        }

        // 按严重程度 + 停滞天数排序
        alerts.sort((a, b) -> {
            int wa = severityWeight(a.getSeverity()), wb = severityWeight(b.getSeverity());
            if (wa != wb) return wb - wa;
            return b.getStagnantDays() - a.getStagnantDays();
        });

        response.setStagnantCount(alerts.size());
        response.setAlerts(alerts);
        log.info("[StagnantAlert] tenant={} checked={} stagnant={}", tenantId, orders.size(), alerts.size());
        return response;
    }

    private int severityWeight(String s) {
        return switch (s == null ? "" : s) {
            case "urgent" -> 3;
            case "alert"  -> 2;
            default       -> 1;
        };
    }
}
