package com.fashion.supplychain.integration.sync.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.sync.entity.EcSyncLog;
import com.fashion.supplychain.integration.sync.mapper.EcSyncLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
public class EcSyncLogService extends ServiceImpl<EcSyncLogMapper, EcSyncLog> {

    public EcSyncLog createLog(Long tenantId, String syncType, String platformCode,
                                String direction, Long styleId, Long skuId,
                                String triggeredBy) {
        EcSyncLog syncLog = new EcSyncLog();
        syncLog.setTenantId(tenantId);
        syncLog.setSyncType(syncType);
        syncLog.setPlatformCode(platformCode);
        syncLog.setDirection(direction);
        syncLog.setStyleId(styleId);
        syncLog.setSkuId(skuId);
        syncLog.setStatus("PENDING");
        syncLog.setRetryCount(0);
        syncLog.setMaxRetries(3);
        syncLog.setTriggeredBy(triggeredBy);
        save(syncLog);
        return syncLog;
    }

    public void markSyncing(Long logId) {
        EcSyncLog syncLog = getById(logId);
        if (syncLog != null) {
            syncLog.setStatus("SYNCING");
            updateById(syncLog);
        }
    }

    public void markSuccess(Long logId, String responsePayload, int durationMs) {
        EcSyncLog syncLog = getById(logId);
        if (syncLog != null) {
            syncLog.setStatus("SYNCED");
            syncLog.setResponsePayload(truncate(responsePayload, 4000));
            syncLog.setDurationMs(durationMs);
            updateById(syncLog);
        }
    }

    public void markFailed(Long logId, String errorCode, String errorMessage) {
        EcSyncLog syncLog = getById(logId);
        if (syncLog != null) {
            syncLog.setRetryCount(syncLog.getRetryCount() + 1);
            syncLog.setErrorCode(errorCode);
            syncLog.setErrorMessage(truncate(errorMessage, 1000));
            if (syncLog.getRetryCount() >= syncLog.getMaxRetries()) {
                syncLog.setStatus("DEAD_LETTER");
            } else {
                syncLog.setStatus("FAILED");
                syncLog.setNextRetryAt(calculateNextRetry(syncLog.getRetryCount()));
            }
            updateById(syncLog);
        }
    }

    public List<EcSyncLog> findRetryable() {
        return list(new QueryWrapper<EcSyncLog>()
                .eq("status", "FAILED")
                .le("next_retry_at", LocalDateTime.now())
                .lt("retry_count", 3)
                .orderByAsc("next_retry_at")
                .last("LIMIT 50"));
    }

    public List<EcSyncLog> findDeadLetters(Long tenantId) {
        return list(new QueryWrapper<EcSyncLog>()
                .eq("tenant_id", tenantId)
                .eq("status", "DEAD_LETTER")
                .orderByDesc("create_time")
                .last("LIMIT 100"));
    }

    private LocalDateTime calculateNextRetry(int retryCount) {
        int[] delays = {30, 120, 600};
        int delaySeconds = retryCount < delays.length ? delays[retryCount] : 600;
        return LocalDateTime.now().plusSeconds(delaySeconds);
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return null;
        return s.length() > maxLen ? s.substring(0, maxLen) : s;
    }
}
