package com.fashion.supplychain.production.job;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.orchestration.MindPushOrchestrator;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import com.fashion.supplychain.production.service.SysNoticeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse;
import com.fashion.supplychain.intelligence.orchestration.AnomalyDetectionOrchestrator;
import com.fashion.supplychain.intelligence.service.WxAlertNotifyService;

@Slf4j
@Component
public class SmartNotifyJob {

    @Autowired
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    @Autowired
    private SysNoticeService sysNoticeService;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired
    private MindPushOrchestrator mindPushOrchestrator;

    @Autowired
    private AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;

    @Autowired
    private WxAlertNotifyService wxAlertNotifyService;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    @Scheduled(cron = "0 0 3 * * ?")
    public void cleanupOldNotices() {
        List<Long> tenantIds;
        try {
            tenantIds = processStatsEngine.findActiveTenantIds();
        } catch (Exception e) {
            log.error("[SmartNotify] 获取活跃租户列表失败，旧通知清理中止", e);
            return;
        }

        int totalDeleted = 0;
        for (Long tenantId : tenantIds) {
            if (tenantId == null) continue;
            TenantAssert.bindTenantForTask(tenantId, "旧通知清理");
            try {
                LocalDateTime cutoff = LocalDateTime.now().minusDays(30);
                long deleted = sysNoticeService.lambdaQuery()
                        .le(SysNotice::getCreatedAt, cutoff)
                        .count();
                if (deleted > 0) {
                    sysNoticeService.lambdaUpdate()
                            .le(SysNotice::getCreatedAt, cutoff)
                            .remove();
                    totalDeleted += deleted;
                }
            } catch (Exception e) {
                log.warn("[SmartNotify] 租户 {} 旧通知清理失败: {}", tenantId, e.getMessage());
            } finally {
                TenantAssert.clearTenantContext();
            }
        }
        if (totalDeleted > 0) {
            log.info("[SmartNotify] 共清理 {} 条30天以上旧通知，涉及 {} 个租户", totalDeleted, tenantIds.size());
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
        log.info("[SmartNotify] 开始自动检测...");
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
            if (tenantId == null) continue;
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

        log.info("[SmartNotify] 完成，共处理 {} 条推送，耗时 {}ms",
                totalSent, System.currentTimeMillis() - startMs);
    }

    private int processOneTenant(Long tenantId) {
        int sent = 0;
        try {
            sent += mindPushOrchestrator.runPushCheck(tenantId);
        } catch (Exception e) {
            log.warn("[SmartNotify] 租户 {} MindPush检测失败: {}", tenantId, e.getMessage());
        }
        try {
            sent += detectAndAlertAnomalies(tenantId);
        } catch (Exception e) {
            log.warn("[SmartNotify] 租户 {} 异常检测失败: {}", tenantId, e.getMessage());
        }
        return sent;
    }

    private int detectAndAlertAnomalies(Long tenantId) {
        AnomalyDetectionResponse result = anomalyDetectionOrchestrator.detect();
        int count = 0;
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
            count++;
        }
        return count;
    }

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
