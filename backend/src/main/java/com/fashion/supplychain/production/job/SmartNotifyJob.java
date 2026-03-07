package com.fashion.supplychain.production.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.service.SysNoticeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 智能跟单通知定时任务 — AI 自动扫描风险订单，无需人工介入，直接推送给跟单员
 *
 * <p>触发频率：每天 08:00 / 14:00 / 20:00</p>
 * <p>两种自动触发条件：</p>
 * <ul>
 *   <li>deadline：距计划完工日期 ≤ 3 天 且 进度 &lt; 80%</li>
 *   <li>stagnant：连续 3 天以上无成功扫码（已有历史扫码的在产订单）</li>
 * </ul>
 * <p>防重复：同订单同通知类型 24h 内不重复发送</p>
 */
@Slf4j
@Component
public class SmartNotifyJob {

    @Autowired
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private SysNoticeService sysNoticeService;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Scheduled(cron = "0 0 8,14,20 * * ?")
    public void autoDetectAndNotify() {
        log.info("[SmartNotify] 开始自动风险检测...");
        long startMs = System.currentTimeMillis();

        List<Long> tenantIds;
        try {
            tenantIds = processStatsEngine.findActiveTenantIds();
        } catch (Exception e) {
            log.error("[SmartNotify] 获取活跃租户失败，任务中止", e);
            return;
        }

        int totalSent = 0;
        for (Long tenantId : tenantIds) {
            TenantAssert.bindTenantForTask(tenantId, "智能通知");
            try {
                totalSent += processOneTenant(tenantId);
            } catch (Exception e) {
                log.warn("[SmartNotify] 租户 {} 处理失败: {}", tenantId, e.getMessage());
            }
        }

        log.info("[SmartNotify] 完成，共发送 {} 条通知，耗时 {}ms",
                totalSent, System.currentTimeMillis() - startMs);
    }

    // ──────────────────────────────────────────────────────────────────────

    private int processOneTenant(Long tenantId) {
        // 查询生产中 + 逾期的订单（且已设置跟单员）
        List<ProductionOrder> orders = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .in(ProductionOrder::getStatus, "production", "delayed")
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .isNotNull(ProductionOrder::getMerchandiser)
                        .ne(ProductionOrder::getMerchandiser, ""));

        int sent = 0;
        for (ProductionOrder order : orders) {
            try {
                if (checkAndNotify(tenantId, order)) sent++;
            } catch (Exception e) {
                log.debug("[SmartNotify] 订单 {} 跳过: {}", order.getOrderNo(), e.getMessage());
            }
        }
        return sent;
    }

    /**
     * 检查订单是否满足通知条件，满足则发送。
     *
     * @return true 表示本次发送了通知
     */
    private boolean checkAndNotify(Long tenantId, ProductionOrder order) {
        int prog = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
        LocalDateTime now = LocalDateTime.now();

        // ① 截止临期：计划完工 ≤ 3 天且进度 < 80%
        if (order.getPlannedEndDate() != null) {
            long daysLeft = ChronoUnit.DAYS.between(now, order.getPlannedEndDate());
            if (daysLeft <= 3 && prog < 80) {
                if (noRecentNotice(tenantId, order.getOrderNo(), "deadline")) {
                    sysNoticeOrchestrator.sendAuto(tenantId, order, "deadline");
                    return true;
                }
            }
        }

        // ② 停滞：有历史扫码，但连续 3 天以上没有成功扫码记录
        ScanRecord lastScan = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getOrderNo, order.getOrderNo())
                .eq(ScanRecord::getScanResult, "success")
                .orderByDesc(ScanRecord::getScanTime)
                .last("LIMIT 1")
                .one();

        if (lastScan != null && lastScan.getScanTime() != null
                && lastScan.getScanTime().isBefore(now.minusDays(3))) {
            if (noRecentNotice(tenantId, order.getOrderNo(), "stagnant")) {
                // 通知跟单员
                sysNoticeOrchestrator.sendAuto(tenantId, order, "stagnant");
                // AI 直达工人手机：通知最后一个扫码的工人，无需管理者转达
                String workerName = lastScan.getOperatorName();
                if (workerName != null && !workerName.isBlank()
                        && !workerName.equals(order.getMerchandiser())) {
                    if (noRecentNotice(tenantId, order.getOrderNo(), "worker_alert")) {
                        sysNoticeOrchestrator.sendWorkerAlert(tenantId, workerName, order);
                    }
                }
                return true;
            }
        }

        return false;
    }

    /**
     * 检查 24h 内是否已发送过同类通知（防重复轰炸）。
     *
     * @return true 表示【没有】近期通知，可以发送
     */
    private boolean noRecentNotice(Long tenantId, String orderNo, String noticeType) {
        long count = sysNoticeService.lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .eq(SysNotice::getOrderNo, orderNo)
                .eq(SysNotice::getNoticeType, noticeType)
                .ge(SysNotice::getCreatedAt, LocalDateTime.now().minusHours(24))
                .count();
        return count == 0;
    }
}
