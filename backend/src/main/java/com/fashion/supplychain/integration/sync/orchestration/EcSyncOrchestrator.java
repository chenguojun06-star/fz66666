package com.fashion.supplychain.integration.sync.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import com.fashion.supplychain.integration.sync.entity.EcSyncLog;
import com.fashion.supplychain.integration.sync.service.EcSyncConfigService;
import com.fashion.supplychain.integration.sync.service.EcSyncLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 电商同步编排层
 *
 * <p>负责同步配置保存、死信重试等数据库写操作。
 * 所有写操作加 @Transactional(rollbackFor = Exception.class)。
 */
@Slf4j
@Service
public class EcSyncOrchestrator {

    @Autowired
    private EcSyncConfigService syncConfigService;

    @Autowired
    private EcSyncLogService syncLogService;

    /**
     * 保存或更新同步配置（自动填充租户ID及默认值）
     */
    @Transactional(rollbackFor = Exception.class)
    public EcSyncConfig saveOrUpdateConfig(Long tenantId, EcSyncConfig config) {
        if (tenantId == null) {
            tenantId = TenantAssert.requireTenantId();
        }
        config.setTenantId(tenantId);
        config.setDeleteFlag(0);
        if (config.getEnabled() == null) config.setEnabled(true);
        if (config.getRateLimitPerMin() == null) config.setRateLimitPerMin(60);
        if (config.getConfigType() == null) config.setConfigType("ECOMMERCE");
        syncConfigService.saveOrUpdate(config);
        log.info("[EcSyncOrchestrator] 同步配置已更新: tenantId={}, platformCode={}",
                tenantId, config.getPlatformCode());
        return config;
    }

    /**
     * 重试死信记录：将状态重置为 PENDING，清空重试计数，并立即允许下次重试
     *
     * @param logId 日志ID
     * @return 是否成功（非死信或不存在则返回 false）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean retryDeadLetter(Long logId) {
        if (logId == null) {
            throw new IllegalArgumentException("logId 不能为空");
        }
        EcSyncLog syncLog = syncLogService.getById(logId);
        if (syncLog == null || !"DEAD_LETTER".equals(syncLog.getStatus())) {
            return false;
        }
        syncLog.setRetryCount(0);
        syncLog.setStatus("PENDING");
        syncLog.setNextRetryAt(LocalDateTime.now());
        syncLogService.updateById(syncLog);
        log.info("[EcSyncOrchestrator] 死信记录已重置: logId={}", logId);
        return true;
    }
}
