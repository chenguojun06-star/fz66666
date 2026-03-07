package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.SmartNotificationResponse;
import com.fashion.supplychain.intelligence.dto.SmartNotificationResponse.NotificationItem;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 智能推送编排器 — 根据业务状态生成个性化通知建议
 *
 * <p>推送类型：
 * <ol>
 *   <li>deadline — 交期迫近（7天内到期且进度 < 80%）</li>
 *   <li>stagnant — 停滞预警（进行中订单 ≥3天无新扫码）</li>
 *   <li>quality  — 质量异常（最近7天某订单失败扫码率 > 10%）</li>
 *   <li>milestone — 里程碑（订单进度突破 50%/80%/完成）</li>
 * </ol>
 */
@Service
@Slf4j
public class SmartNotificationOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    public SmartNotificationResponse generateNotifications() {
        SmartNotificationResponse resp = new SmartNotificationResponse();
        try {
        Long tenantId = UserContext.tenantId();
        List<NotificationItem> notifications = new ArrayList<>();

        // ── 1. 交期迫近 ──
        notifications.addAll(detectDeadlineWarnings(tenantId));

        // ── 2. 停滞预警 ──
        notifications.addAll(detectStagnantOrders(tenantId));

        // ── 3. 质量异常 ──
        notifications.addAll(detectQualityIssues(tenantId));

        // ── 4. 里程碑通知 ──
        notifications.addAll(detectMilestones(tenantId));

        // 按优先级排序: high > medium > low
        Map<String, Integer> prioOrder = Map.of("high", 0, "medium", 1, "low", 2);
        notifications.sort(Comparator.comparingInt(n -> prioOrder.getOrDefault(n.getPriority(), 9)));

        int sentToday = notifications.size();
        int highPriorityCount = (int) notifications.stream()
                .filter(n -> "high".equals(n.getPriority())).count();
        resp.setNotifications(notifications);
        resp.setPendingCount(highPriorityCount);
        resp.setSentToday(sentToday);
        // 非紧急通知占比：高优先级越少，系统越健康（100% = 全为中低优先级/无通知）
        double successRate = sentToday == 0 ? 100.0
                : Math.round((double)(sentToday - highPriorityCount) / sentToday * 1000) / 10.0;
        resp.setSuccessRate(successRate);
        } catch (Exception e) {
            log.error("[智能通知] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    // ── 交期迫近 ──
    private List<NotificationItem> detectDeadlineWarnings(Long tenantId) {
        List<NotificationItem> result = new ArrayList<>();
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .eq("status", "IN_PROGRESS")
          .le("expected_ship_date", LocalDate.now().plusDays(7))
          .ge("expected_ship_date", LocalDate.now());
        List<ProductionOrder> orders = productionOrderService.list(qw);

        for (ProductionOrder o : orders) {
            int progress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
            if (progress < 80) {
                long daysLeft = o.getExpectedShipDate() != null
                        ? ChronoUnit.DAYS.between(LocalDate.now(), o.getExpectedShipDate())
                        : 0;
                NotificationItem n = new NotificationItem();
                n.setTitle("交期预警");
                n.setContent(String.format("订单 %s 还有 %d 天到期，进度仅 %d%%",
                        o.getOrderNo(), daysLeft, progress));
                n.setPriority("high");
                n.setType("deadline");
                n.setTargetRole("manager");
                n.setOrderNo(o.getOrderNo());
                n.setCreatedAt(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
                result.add(n);
            }
        }
        return result;
    }

    // ── 停滞预警 ──
    private List<NotificationItem> detectStagnantOrders(Long tenantId) {
        List<NotificationItem> result = new ArrayList<>();
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .eq("status", "IN_PROGRESS");
        List<ProductionOrder> orders = productionOrderService.list(qw);

        LocalDateTime cutoff = LocalDateTime.now().minusDays(3);
        for (ProductionOrder o : orders) {
            QueryWrapper<ScanRecord> sqw = new QueryWrapper<>();
            sqw.eq("order_id", o.getId())
              .eq("scan_result", "success")
              .ge("scan_time", cutoff);
            long recentCount = scanRecordService.count(sqw);

            if (recentCount == 0) {
                // 检查是否有历史扫码
                QueryWrapper<ScanRecord> all = new QueryWrapper<>();
                all.eq("order_id", o.getId()).eq("scan_result", "success");
                long total = scanRecordService.count(all);
                if (total > 0) {
                    NotificationItem n = new NotificationItem();
                    n.setTitle("生产停滞");
                    n.setContent(String.format("订单 %s 已超过 3 天无新扫码", o.getOrderNo()));
                    n.setPriority("medium");
                    n.setType("stagnant");
                    n.setTargetRole("factory");
                    n.setOrderNo(o.getOrderNo());
                    n.setCreatedAt(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
                    result.add(n);
                }
            }
        }
        return result;
    }

    // ── 质量异常 ──
    private List<NotificationItem> detectQualityIssues(Long tenantId) {
        List<NotificationItem> result = new ArrayList<>();
        LocalDateTime weekAgo = LocalDateTime.now().minusDays(7);

        QueryWrapper<ScanRecord> sqw = new QueryWrapper<>();
        sqw.eq(tenantId != null, "tenant_id", tenantId)
          .ge("scan_time", weekAgo);
        List<ScanRecord> scans = scanRecordService.list(sqw);

        // 按订单分组统计
        Map<String, List<ScanRecord>> byOrder = scans.stream()
                .filter(s -> s.getOrderId() != null)
                .collect(Collectors.groupingBy(ScanRecord::getOrderId));

        for (Map.Entry<String, List<ScanRecord>> entry : byOrder.entrySet()) {
            List<ScanRecord> orderScans = entry.getValue();
            long total = orderScans.size();
            long failed = orderScans.stream()
                    .filter(s -> "fail".equals(s.getScanResult())).count();
            if (total >= 10 && (double) failed / total > 0.10) {
                String orderNo = orderScans.get(0).getOrderNo();
                NotificationItem n = new NotificationItem();
                n.setTitle("质量异常");
                n.setContent(String.format("订单 %s 近7天失败率 %.0f%%（%d/%d次）",
                        orderNo, failed * 100.0 / total, failed, total));
                n.setPriority("high");
                n.setType("quality");
                n.setTargetRole("quality");
                n.setOrderNo(orderNo);
                n.setCreatedAt(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
                result.add(n);
            }
        }
        return result;
    }

    // ── 里程碑通知 ──
    private List<NotificationItem> detectMilestones(Long tenantId) {
        List<NotificationItem> result = new ArrayList<>();
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .in("status", Arrays.asList("IN_PROGRESS", "COMPLETED"));
        List<ProductionOrder> orders = productionOrderService.list(qw);

        for (ProductionOrder o : orders) {
            int progress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
            if (progress == 100 || "COMPLETED".equals(o.getStatus())) {
                createMilestone(result, o, "🎉 完工", "已全部完成！", "low");
            } else if (progress >= 80) {
                createMilestone(result, o, "📦 冲刺", String.format("进度 %d%%，进入冲刺阶段", progress), "low");
            } else if (progress >= 50) {
                createMilestone(result, o, "🏃 半程", String.format("进度 %d%%，已过半程", progress), "low");
            }
        }
        return result;
    }

    private void createMilestone(List<NotificationItem> list, ProductionOrder o,
                                 String title, String detail, String prio) {
        NotificationItem n = new NotificationItem();
        n.setTitle(title);
        n.setContent(String.format("订单 %s %s", o.getOrderNo(), detail));
        n.setPriority(prio);
        n.setType("milestone");
        n.setTargetRole("all");
        n.setOrderNo(o.getOrderNo());
        n.setCreatedAt(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        list.add(n);
    }

    // ── 对外调用方法（供 SmartWorkflowOrchestrator 使用）──

    public void notifyTeam(String teamCode, String title, String content, Long tenantId) {
        log.info("[Notification] notifyTeam: team={}, title={}, tenantId={}", teamCode, title, tenantId);
    }

    public void notifyRole(String roleCode, String title, String content, Long tenantId) {
        log.info("[Notification] notifyRole: role={}, title={}, tenantId={}", roleCode, title, tenantId);
    }

    public void notifyKpiDashboard(String dashboardType, String targetId, String level, Long tenantId) {
        log.info("[Notification] notifyKpiDashboard: type={}, targetId={}, level={}, tenantId={}",
                dashboardType, targetId, level, tenantId);
    }
}
