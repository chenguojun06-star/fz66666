package com.fashion.supplychain.integration.sync.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapterRegistry;
import com.fashion.supplychain.integration.sync.entity.EcProductMapping;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import com.fashion.supplychain.integration.sync.entity.EcSyncLog;
import com.fashion.supplychain.integration.sync.service.EcProductMappingService;
import com.fashion.supplychain.integration.sync.service.EcSyncConfigService;
import com.fashion.supplychain.integration.sync.service.EcSyncLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 电商同步编排层
 *
 * <p>负责同步配置保存、死信重试等数据库写操作，以及映射/日志/健康度等读操作。
 * 所有写操作加 @Transactional(rollbackFor = Exception.class)。
 *
 * <p>D-636：读操作（映射列表、同步日志分页、健康度、配置列表、平台清单）原在
 * {@code EcSyncController} 里直接调 3 个 Service，属「Controller 依赖多个 Service」，
 * 已下沉到本类。租户上下文由本类内部通过 {@link TenantAssert#requireTenantId()} 读取。
 */
@Slf4j
@Service
public class EcSyncOrchestrator {

    @Autowired
    private EcSyncConfigService syncConfigService;

    @Autowired
    private EcSyncLogService syncLogService;

    @Autowired
    private EcProductMappingService mappingService;

    @Autowired
    private EcPlatformAdapterRegistry adapterRegistry;

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

    // ===== 读操作（D-636 从 EcSyncController 下沉） =====

    /** 平台适配器支持的所有平台编码 */
    public List<String> getSupportedPlatforms() {
        return adapterRegistry.getSupportedPlatforms();
    }

    /** 按款式查商品映射（自动限定当前租户） */
    public List<EcProductMapping> listMappings(Long styleId) {
        return mappingService.listByStyle(styleId, TenantAssert.requireTenantId());
    }

    /** 新增或更新商品映射（自动限定当前租户） */
    public EcProductMapping createMapping(Long styleId, Long skuId, String platformCode,
                                          String platformItemId, String platformSkuId) {
        return mappingService.upsertMapping(
                TenantAssert.requireTenantId(), styleId, skuId, platformCode, platformItemId, platformSkuId);
    }

    /** 同步日志分页查询（按租户隔离，时间倒序） */
    public IPage<EcSyncLog> listSyncLogs(int page, int size, String platformCode, String status) {
        Long tenantId = TenantAssert.requireTenantId();
        QueryWrapper<EcSyncLog> wrapper = new QueryWrapper<EcSyncLog>()
                .eq("tenant_id", tenantId)
                .orderByDesc("create_time");
        if (platformCode != null) wrapper.eq("platform_code", platformCode);
        if (status != null) wrapper.eq("status", status);
        return syncLogService.page(new Page<>(page, size), wrapper);
    }

    /** 同步健康度：各状态日志计数 + 已启用平台数 + 支持平台清单 */
    public Map<String, Object> getHealth() {
        Long tenantId = TenantAssert.requireTenantId();
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("pendingCount", syncLogService.count(new QueryWrapper<EcSyncLog>()
                .eq("tenant_id", tenantId).eq("status", "PENDING")));
        health.put("failedCount", syncLogService.count(new QueryWrapper<EcSyncLog>()
                .eq("tenant_id", tenantId).eq("status", "FAILED")));
        health.put("deadLetterCount", syncLogService.count(new QueryWrapper<EcSyncLog>()
                .eq("tenant_id", tenantId).eq("status", "DEAD_LETTER")));
        health.put("syncedCount", syncLogService.count(new QueryWrapper<EcSyncLog>()
                .eq("tenant_id", tenantId).eq("status", "SYNCED")));
        health.put("enabledPlatforms", syncConfigService.listEnabledByTenant(tenantId).size());
        health.put("supportedPlatforms", adapterRegistry.getSupportedPlatforms());
        return health;
    }

    /** 当前租户已启用的同步配置列表 */
    public List<EcSyncConfig> listConfigs() {
        return syncConfigService.listEnabledByTenant(TenantAssert.requireTenantId());
    }
}
