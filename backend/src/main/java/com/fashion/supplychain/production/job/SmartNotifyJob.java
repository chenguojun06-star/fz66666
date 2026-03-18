package com.fashion.supplychain.production.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.orchestration.MindPushOrchestrator;
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
import java.util.concurrent.TimeUnit;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionResponse;
import com.fashion.supplychain.intelligence.orchestration.AnomalyDetectionOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.DeliveryPredictionOrchestrator;
import com.fashion.supplychain.intelligence.service.WxAlertNotifyService;

/**
 * 智能跟单通知定时任务 — AI 自动扫描风险订单，无需人工介入，直接推送给跟单员
 *
 * <p>触发频率：每小时整点检查（结合用户设定的推送时段决定是否推送）</p>
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

    @Autowired
    private MindPushOrchestrator mindPushOrchestrator;

    @Autowired
    private AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;

    @Autowired
    private DeliveryPredictionOrchestrator deliveryPredictionOrchestrator;

    @Autowired
    private WxAlertNotifyService wxAlertNotifyService;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    /** 每天凌晨3点清理30天以上的旧通知，防止无限堆积 */
    @Scheduled(cron = "0 0 3 * * ?")
    public void cleanupOldNotices() {
        try {
            LocalDateTime cutoff = LocalDateTime.now().minusDays(30);
            long deleted = sysNoticeService.lambdaQuery()
                    .le(com.fashion.supplychain.production.entity.SysNotice::getCreatedAt, cutoff)
                    .count();
            if (deleted > 0) {
                sysNoticeService.lambdaUpdate()
                        .le(com.fashion.supplychain.production.entity.SysNotice::getCreatedAt, cutoff)
                        .remove();
                log.info("[SmartNotify] 清理 {} 条30天以上旧通知", deleted);
            }
        } catch (Exception e) {
            log.warn("[SmartNotify] 旧通知清理失败: {}", e.getMessage());
        }
    }

    @Scheduled(cron = "0 0 * * * ?")
    public void autoDetectAndNotify() {
        try {
            if (distributedLockService != null) {
                String lockValue = distributedLockService.tryLock("job:smart-notify", 50, TimeUnit.MINUTES);
                if (lockValue == null) {
                    log.info("[SmartNotify] 其他实例正在执行，跳过");
                    return;
                }
                try {
                    doAutoDetect();
                } finally {
                    distributedLockService.unlock("job:smart-notify", lockValue);
                }
            } else {
                doAutoDetect();
            }
        } catch (Exception e) {
            log.error("[SmartNotify] 定时任务执行失败", e);
        }
    }

    private void doAutoDetect() {
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
            if (tenantId == null) {
                log.warn("[SmartNotify] 活跃租户列表出现空 tenantId，已跳过");
                continue;
            }
            // ── 推送时段检查：不在用户设定的推送时段内则跳过 ──
            if (!mindPushOrchestrator.isWithinPushWindow(tenantId)) {
                log.debug("[SmartNotify] 租户 {} 当前不在推送时段内，跳过", tenantId);
                continue;
            }
            try {
                TenantAssert.bindTenantForTask(tenantId, "智能通知");
                totalSent += processOneTenant(tenantId);
            } catch (Exception e) {
                log.warn("[SmartNotify] 租户 {} 处理失败: {}", tenantId, e.getMessage());
            } finally {
                TenantAssert.clearTenantContext();
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
        // ── 异常检测：产量飙升/夜间扫码/停工工人 → 紧急推送 ──
        try {
            detectAndAlertAnomalies(tenantId);
        } catch (Exception e) {
            log.warn("[SmartNotify] 租户 {} 异常检测失败: {}", tenantId, e.getMessage());
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

        // ① 截止临期：≤3天硬规则 OR ≤14天AI速度预测延期
        if (order.getPlannedEndDate() != null) {
            long daysLeft = ChronoUnit.DAYS.between(now, order.getPlannedEndDate());
            boolean shouldAlert = (daysLeft <= 3 && prog < 80);
            // AI速度预测：提前预警14天内可能延期的订单
            if (!shouldAlert && daysLeft > 3 && daysLeft <= 14 && prog < 90) {
                try {
                    DeliveryPredictionRequest req = new DeliveryPredictionRequest();
                    req.setOrderId(order.getOrderNo());
                    DeliveryPredictionResponse pred = deliveryPredictionOrchestrator.predict(req);
                    shouldAlert = pred.isLikelyDelayed() && pred.getConfidence() >= 70;
                    if (shouldAlert) {
                        log.info("[SmartNotify] AI速度预测延期预警: order={}, velocity={}/天, 预测完工={}",
                                order.getOrderNo(), pred.getDailyVelocity(), pred.getMostLikelyDate());
                    }
                } catch (Exception e) {
                    log.debug("[SmartNotify] 速度预测跳过 {}: {}", order.getOrderNo(), e.getMessage());
                }
            }
            if (shouldAlert && noRecentNotice(tenantId, order.getOrderNo(), "deadline")) {
                sysNoticeOrchestrator.sendAuto(tenantId, order, "deadline");
                return true;
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
     * 扫描当前租户的异常信号（产量飙升/夜间扫码/停工工人），
     * 对 critical 级别异常进行系统通知 + 微信推送，并做 24h 去重。
     */
    private void detectAndAlertAnomalies(Long tenantId) {
        AnomalyDetectionResponse result = anomalyDetectionOrchestrator.detect();
        for (AnomalyDetectionResponse.AnomalyItem item : result.getAnomalies()) {
            if (!"critical".equals(item.getSeverity())) continue;
            String dedupKey = "anomaly_" + item.getType()
                    + (item.getTargetName() != null ? "_" + item.getTargetName() : "");
            if (!noRecentNotice(tenantId, dedupKey, "anomaly")) continue;
            SysNotice notice = new SysNotice();
            notice.setTenantId(tenantId);
            notice.setFromName("AI检测");
            notice.setOrderNo(dedupKey);
            notice.setTitle("⚠️ " + item.getTitle());
            notice.setContent(item.getDescription());
            notice.setNoticeType("anomaly");
            notice.setIsRead(0);
            notice.setCreatedAt(LocalDateTime.now());
            sysNoticeService.save(notice);
            wxAlertNotifyService.notifyAlert(tenantId, item.getTitle(),
                    item.getDescription(), null, "pages/index/index");
            log.info("[SmartNotify] 异常推送: tenant={}, type={}, target={}",
                    tenantId, item.getType(), item.getTargetName());
        }
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
