package com.fashion.supplychain.integration.sync.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.sync.entity.EcProductMapping;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import com.fashion.supplychain.integration.sync.entity.EcSyncLog;
import com.fashion.supplychain.integration.sync.orchestration.EcSyncOrchestrator;
import com.fashion.supplychain.integration.sync.orchestration.ProductSyncOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 电商同步 Controller。
 *
 * <p>D-636：原先本类直接注入了 EcSyncConfigService / EcProductMappingService /
 * EcSyncLogService 三个 Service（映射、日志、健康度、配置列表都在 Controller 里直接查库），
 * 属「Controller 依赖多个 Service」。取数逻辑已下沉到 {@link EcSyncOrchestrator}，
 * 本类只保留「端点声明 + 请求参数解析 + 响应组装」。
 */
@Slf4j
@RestController
@RequestMapping("/api/ec-sync")
@PreAuthorize("isAuthenticated()")
public class EcSyncController {

    @Autowired
    private ProductSyncOrchestrator syncOrchestrator;

    @Autowired
    private EcSyncOrchestrator ecSyncOrchestrator;

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
        return Result.success(ecSyncOrchestrator.getSupportedPlatforms());
    }

    @GetMapping("/mappings")
    public Result<List<EcProductMapping>> listMappings(@RequestParam Long styleId) {
        return Result.success(ecSyncOrchestrator.listMappings(styleId));
    }

    @PostMapping("/mappings")
    public Result<EcProductMapping> createMapping(@RequestBody Map<String, Object> body) {
        Long styleId = Long.valueOf(body.get("styleId").toString());
        Long skuId = body.get("skuId") != null ? Long.valueOf(body.get("skuId").toString()) : null;
        String platformCode = (String) body.get("platformCode");
        String platformItemId = (String) body.get("platformItemId");
        String platformSkuId = (String) body.get("platformSkuId");
        return Result.success(ecSyncOrchestrator.createMapping(
                styleId, skuId, platformCode, platformItemId, platformSkuId));
    }

    @GetMapping("/logs")
    public Result<IPage<EcSyncLog>> listSyncLogs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String platformCode,
            @RequestParam(required = false) String status) {
        return Result.success(ecSyncOrchestrator.listSyncLogs(page, size, platformCode, status));
    }

    @GetMapping("/health")
    public Result<Map<String, Object>> getHealth() {
        return Result.success(ecSyncOrchestrator.getHealth());
    }

    @PostMapping("/config")
    public Result<EcSyncConfig> saveConfig(@RequestBody EcSyncConfig config) {
        Long tenantId = TenantAssert.requireTenantId();
        EcSyncConfig saved = ecSyncOrchestrator.saveOrUpdateConfig(tenantId, config);
        return Result.success(saved);
    }

    @GetMapping("/config")
    public Result<List<EcSyncConfig>> listConfigs() {
        return Result.success(ecSyncOrchestrator.listConfigs());
    }

    @PostMapping("/dead-letter/retry/{logId}")
    public Result<Map<String, Object>> retryDeadLetter(@PathVariable Long logId) {
        boolean success = ecSyncOrchestrator.retryDeadLetter(logId);
        if (!success) {
            return Result.fail("非死信记录或记录不存在");
        }
        return Result.success(Map.of("logId", logId, "retried", true));
    }
}
