package com.fashion.supplychain.integration.sync.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapterRegistry;
import com.fashion.supplychain.integration.sync.entity.EcProductMapping;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import com.fashion.supplychain.integration.sync.entity.EcSyncLog;
import com.fashion.supplychain.integration.sync.orchestration.ProductSyncOrchestrator;
import com.fashion.supplychain.integration.sync.service.EcProductMappingService;
import com.fashion.supplychain.integration.sync.service.EcSyncConfigService;
import com.fashion.supplychain.integration.sync.service.EcSyncLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/ec-sync")
@PreAuthorize("isAuthenticated()")
public class EcSyncController {

    @Autowired
    private ProductSyncOrchestrator syncOrchestrator;

    @Autowired
    private EcSyncConfigService syncConfigService;

    @Autowired
    private EcProductMappingService mappingService;

    @Autowired
    private EcSyncLogService syncLogService;

    @Autowired
    private EcPlatformAdapterRegistry adapterRegistry;

    @PostMapping("/stock/{styleId}")
    public Result<Map<String, Object>> pushStock(
            @PathVariable Long styleId,
            @RequestParam String platformCode) {
        Long tenantId = TenantAssert.requireTenantId();
        syncOrchestrator.pushStockToPlatform(styleId, platformCode, tenantId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("styleId", styleId);
        result.put("platformCode", platformCode);
        result.put("triggered", true);
        return Result.success(result);
    }

    @PostMapping("/price/{styleId}")
    public Result<Map<String, Object>> pushPrice(
            @PathVariable Long styleId,
            @RequestParam String platformCode) {
        Long tenantId = TenantAssert.requireTenantId();
        syncOrchestrator.pushPriceToPlatform(styleId, platformCode, tenantId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("styleId", styleId);
        result.put("platformCode", platformCode);
        result.put("triggered", true);
        return Result.success(result);
    }

    @PostMapping("/product/{styleId}")
    public Result<Map<String, Object>> pushProduct(
            @PathVariable Long styleId,
            @RequestParam String platformCode) {
        Long tenantId = TenantAssert.requireTenantId();
        syncOrchestrator.pushProductToPlatform(styleId, platformCode, tenantId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("styleId", styleId);
        result.put("platformCode", platformCode);
        result.put("triggered", true);
        return Result.success(result);
    }

    @PostMapping("/sync-all/{styleId}")
    public Result<Map<String, Object>> syncAllPlatforms(@PathVariable Long styleId) {
        Long tenantId = TenantAssert.requireTenantId();
        syncOrchestrator.syncAllPlatforms(styleId, tenantId);
        return Result.success(Map.of("styleId", styleId, "triggered", true));
    }

    @GetMapping("/supported-platforms")
    public Result<List<String>> getSupportedPlatforms() {
        return Result.success(adapterRegistry.getSupportedPlatforms());
    }

    @GetMapping("/mappings")
    public Result<List<EcProductMapping>> listMappings(@RequestParam Long styleId) {
        Long tenantId = TenantAssert.requireTenantId();
        return Result.success(mappingService.listByStyle(styleId, tenantId));
    }

    @PostMapping("/mappings")
    public Result<EcProductMapping> createMapping(@RequestBody Map<String, Object> body) {
        Long tenantId = TenantAssert.requireTenantId();
        Long styleId = Long.valueOf(body.get("styleId").toString());
        Long skuId = body.get("skuId") != null ? Long.valueOf(body.get("skuId").toString()) : null;
        String platformCode = (String) body.get("platformCode");
        String platformItemId = (String) body.get("platformItemId");
        String platformSkuId = (String) body.get("platformSkuId");
        EcProductMapping mapping = mappingService.upsertMapping(
                tenantId, styleId, skuId, platformCode, platformItemId, platformSkuId);
        return Result.success(mapping);
    }

    @GetMapping("/logs")
    public Result<IPage<EcSyncLog>> listSyncLogs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String platformCode,
            @RequestParam(required = false) String status) {
        Long tenantId = TenantAssert.requireTenantId();
        QueryWrapper<EcSyncLog> wrapper = new QueryWrapper<EcSyncLog>()
                .eq("tenant_id", tenantId)
                .orderByDesc("create_time");
        if (platformCode != null) wrapper.eq("platform_code", platformCode);
        if (status != null) wrapper.eq("status", status);
        IPage<EcSyncLog> result = syncLogService.page(new Page<>(page, size), wrapper);
        return Result.success(result);
    }

    @GetMapping("/health")
    public Result<Map<String, Object>> getHealth() {
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
        return Result.success(health);
    }

    @PostMapping("/config")
    public Result<EcSyncConfig> saveConfig(@RequestBody EcSyncConfig config) {
        Long tenantId = TenantAssert.requireTenantId();
        config.setTenantId(tenantId);
        config.setDeleteFlag(0);
        if (config.getEnabled() == null) config.setEnabled(true);
        if (config.getRateLimitPerMin() == null) config.setRateLimitPerMin(60);
        if (config.getConfigType() == null) config.setConfigType("ECOMMERCE");
        syncConfigService.saveOrUpdate(config);
        return Result.success(config);
    }

    @GetMapping("/config")
    public Result<List<EcSyncConfig>> listConfigs() {
        Long tenantId = TenantAssert.requireTenantId();
        return Result.success(syncConfigService.listEnabledByTenant(tenantId));
    }

    @PostMapping("/dead-letter/retry/{logId}")
    public Result<Map<String, Object>> retryDeadLetter(@PathVariable Long logId) {
        EcSyncLog syncLog = syncLogService.getById(logId);
        if (syncLog == null || !"DEAD_LETTER".equals(syncLog.getStatus())) {
            return Result.fail("非死信记录或记录不存在");
        }
        syncLog.setRetryCount(0);
        syncLog.setStatus("PENDING");
        syncLog.setNextRetryAt(java.time.LocalDateTime.now());
        syncLogService.updateById(syncLog);
        return Result.success(Map.of("logId", logId, "retried", true));
    }
}
