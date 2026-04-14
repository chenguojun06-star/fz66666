package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SysNoticeService;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.system.service.TenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.util.concurrent.TimeUnit;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AI主动巡检编排器 — 每30分钟自动扫描全部活跃租户，发现问题后主动推送
 * 站内通知给责任人，无需任何人手动触发。
 *
 * 扫描两大场景：
 *  1. 逾期未完成订单   → 通知跟单员
 *  2. 停滞订单(≥3天)   → 通知跟单员
 *
 * 去重机制：同类型通知24小时内不重复推送同一订单。
 */
@Slf4j
@Service
public class AiPatrolOrchestrator {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("MM-dd");

    private static final Set<String> TERMINAL_STATUSES =
            Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired private TenantService tenantService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ScanRecordMapper scanRecordMapper;
    @Autowired private SysNoticeService sysNoticeService;
    @Autowired(required = false) private DistributedLockService distributedLockService;
    @Autowired private AiAgentTraceOrchestrator traceOrchestrator;

    // ─── 定时调度 ─────────────────────────────────────────────────────────────

    /**
     * 每30分钟自动巡检（系统启动5分钟后首次执行，避免DB连接未就绪）
     */
    // 初始延迟10分钟，错开与 IntelligenceSignalCollectionJob(:05/:35) 的触发时间
    @Scheduled(fixedRate = 30 * 60 * 1000, initialDelay = 10 * 60 * 1000)
    public void schedulePatrol() {
        if (distributedLockService != null) {
            String lockValue = distributedLockService.tryLock("job:ai-patrol", 25, TimeUnit.MINUTES);
            if (lockValue == null) {
                log.debug("[AiPatrol] 其他实例正在执行，跳过");
                return;
            }
            try {
                doPatrol();
            } finally {
                distributedLockService.unlock("job:ai-patrol", lockValue);
            }
        } else {
            doPatrol();
        }
    }

    private void doPatrol() {
        List<Tenant> tenants = tenantService.list();
        log.info("[AiPatrol] 开始定时巡检，共 {} 个租户", tenants.size());
        int total = 0;
        for (Tenant t : tenants) {
            if (isDisabled(t)) continue;
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(t.getId(), "ai-patrol",
                        "定时巡检：逾期订单+停滞订单扫描");
                int n = patrolTenantInternal(t.getId(), commandId);
                total += n;
                traceOrchestrator.finishPatrolRequest(t.getId(), commandId,
                        "巡检完成，推送" + n + "条通知", null, System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[AiPatrol] 租户{}巡检异常: {}", t.getId(), e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(t.getId(), commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[AiPatrol] 巡检完成，本轮推送 {} 条通知", total);
    }

    /**
     * 手动触发指定租户的巡检（供管理员API调用）
     * @return 推送通知数量
     */
    public int patrolTenant(Long tenantId) {
        long start = System.currentTimeMillis();
        String commandId = traceOrchestrator.startPatrolRequest(tenantId, "ai-patrol",
                "手动触发巡检：逾期订单+停滞订单扫描");
        int n = patrolTenantInternal(tenantId, commandId);
        traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                "巡检完成，推送" + n + "条通知", null, System.currentTimeMillis() - start);
        return n;
    }

    private int patrolTenantInternal(Long tenantId, String commandId) {
        int n = 0;
        long s1 = System.currentTimeMillis();
        int overdue = scanOverdueOrders(tenantId);
        traceOrchestrator.recordPatrolStep(tenantId, commandId, "scanOverdue",
                "逾期订单扫描，发现" + overdue + "条需通知", System.currentTimeMillis() - s1, true);
        n += overdue;

        long s2 = System.currentTimeMillis();
        int stagnant = scanStagnantOrders(tenantId);
        traceOrchestrator.recordPatrolStep(tenantId, commandId, "scanStagnant",
                "停滞订单扫描，发现" + stagnant + "条需通知", System.currentTimeMillis() - s2, true);
        n += stagnant;
        return n;
    }

    // ─── 1. 逾期订单 ─────────────────────────────────────────────────────────

    private int scanOverdueOrders(Long tenantId) {
        LocalDateTime now = LocalDateTime.now();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .last("LIMIT 20")
                .list();

        int count = 0;
        for (ProductionOrder o : orders) {
            if (!recentlySent(tenantId, o.getOrderNo(), "overdue")) {
                long overdueDays = ChronoUnit.DAYS.between(o.getPlannedEndDate(), now);
                String body = String.format(
                        "订单【%s】交期 %s 已逾期 %d 天，当前进度 %d%%，请尽快协调工厂加快生产或调整交期。",
                        o.getOrderNo(),
                        o.getPlannedEndDate().format(FMT),
                        Math.max(0, overdueDays),
                        pct(o));
                push(tenantId, o.getOrderNo(), o.getMerchandiser(),
                        "⚠️ 逾期订单：" + o.getOrderNo(), body, "overdue");
                count++;
            }
        }
        return count;
    }

    // ─── 2. 停滞订单 ─────────────────────────────────────────────────────────

    private int scanStagnantOrders(Long tenantId) {
        // 拉最多50条进行中订单，然后批量查最后扫码时间
        List<ProductionOrder> inProg = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                .last("LIMIT 50")
                .list();
        if (inProg.isEmpty()) return 0;

        List<String> ids = inProg.stream().map(ProductionOrder::getId).collect(Collectors.toList());
        List<Map<String, Object>> lastScans = scanRecordMapper.selectLastScanTimeByOrderIds(ids, tenantId);

        // orderId → lastScanTime
        Map<String, LocalDateTime> lastScanMap = new HashMap<>();
        for (Map<String, Object> row : lastScans) {
            String ordId = (String) row.get("orderId");
            Object ts = row.get("lastScanTime");
            if (ordId != null && ts != null) {
                if (ts instanceof Timestamp) {
                    lastScanMap.put(ordId, ((Timestamp) ts).toLocalDateTime());
                } else if (ts instanceof LocalDateTime) {
                    lastScanMap.put(ordId, (LocalDateTime) ts);
                }
            }
        }

        LocalDateTime threshold = LocalDateTime.now().minusDays(3);
        int count = 0;
        for (ProductionOrder o : inProg) {
            LocalDateTime last = lastScanMap.get(o.getId());
            if (last == null) continue; // 无扫码记录不算停滞
            if (last.isBefore(threshold) && !recentlySent(tenantId, o.getOrderNo(), "stagnant")) {
                long days = ChronoUnit.DAYS.between(last, LocalDateTime.now());
                String deadline = o.getPlannedEndDate() != null ? o.getPlannedEndDate().format(FMT) : "未设置";
                String body = String.format(
                        "订单【%s】已 %d 天无新增扫码记录，当前进度 %d%%，交期 %s，请联系工厂确认生产状态。",
                        o.getOrderNo(), days, pct(o), deadline);
                push(tenantId, o.getOrderNo(), o.getMerchandiser(),
                        "⏸ 生产停滞：" + o.getOrderNo(), body, "stagnant");
                count++;
            }
        }
        return count;
    }

    // ─── 工具方法 ─────────────────────────────────────────────────────────────

    /** 24小时内是否已推送过同类通知（去重） */
    private boolean recentlySent(Long tenantId, String orderNo, String noticeType) {
        return sysNoticeService.lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .eq(SysNotice::getOrderNo, orderNo)
                .eq(SysNotice::getNoticeType, noticeType)
                .gt(SysNotice::getCreatedAt, LocalDateTime.now().minusHours(24))
                .count() > 0;
    }

    private void push(Long tenantId, String orderNo, String toName,
                      String title, String content, String noticeType) {
        SysNotice n = new SysNotice();
        n.setTenantId(tenantId);
        n.setToName(toName == null || toName.isBlank() ? "管理员" : toName);
        n.setFromName("AI巡检助手");
        n.setOrderNo(orderNo);
        n.setTitle(title);
        n.setContent(content);
        n.setNoticeType(noticeType);
        n.setIsRead(0);
        n.setCreatedAt(LocalDateTime.now());
        sysNoticeService.save(n);
        log.info("[AiPatrol] ✅ type={} to={} key={}", noticeType, toName, orderNo);
    }

    private boolean isDisabled(Tenant t) {
        if (t == null) return true;
        String s = t.getStatus();
        return "DISABLED".equalsIgnoreCase(s) || "SUSPENDED".equalsIgnoreCase(s);
    }

    private int pct(ProductionOrder o) {
        return o.getProductionProgress() != null ? o.getProductionProgress() : 0;
    }
}
