package com.fashion.supplychain.integration.ecommerce.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.orchestration.PlatformConnectorOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 外部平台对接管理 Controller
 * 提供连接测试、店铺发现、手动同步等"傻瓜式"操作
 *
 * <p>业务逻辑全部下沉至 {@link PlatformConnectorOrchestrator}；
 * 本类只做「解析租户 → 委托 → 组装 Result」。
 *
 * <p>⚠️ 所有数据库写操作必须通过 {@link PlatformConnectorOrchestrator}
 * （其内部再经由 {@code EcPlatformConfigOrchestrator}）执行，
 * 禁止直接在 Controller 中调用 Service 的 save/update/delete 方法。
 */
@RestController
@RequestMapping("/api/platform-connector")
@PreAuthorize("isAuthenticated()")
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class PlatformConnectorController {

    @Autowired
    private PlatformConnectorOrchestrator platformConnectorOrchestrator;

    /**
     * 保存平台凭证（AppKey + AppSecret）
     */
    @PostMapping("/save-config")
    @Deprecated
    public Result<Map<String, Object>> saveConfig(@RequestBody Map<String, Object> body) {
        return platformConnectorOrchestrator.saveConfig(TenantAssert.requireTenantId(), body);
    }

    @PutMapping("/config")
    public Result<Map<String, Object>> updateConfig(@RequestBody Map<String, Object> body) {
        return platformConnectorOrchestrator.saveConfig(TenantAssert.requireTenantId(), body);
    }

    /**
     * 获取平台配置状态
     */
    @GetMapping("/config-status")
    public Result<Map<String, Object>> getConfigStatus(
            @RequestParam String platformCode) {
        return Result.success(
                platformConnectorOrchestrator.getConfigStatus(TenantAssert.requireTenantId(), platformCode));
    }

    /**
     * D-587：生成跳转平台授权页的 URL（商家在平台登录并确认后，平台回调我们的 callback）。
     * 前提：该租户此平台已保存 AppKey/AppSecret（平台自用型应用的 client_id/client_secret）。
     */
    @GetMapping("/oauth/{platformCode}/authorize-url")
    public Result<Map<String, Object>> buildAuthorizeUrl(@PathVariable String platformCode) {
        return Result.success(
                platformConnectorOrchestrator.buildAuthorizeUrl(TenantAssert.requireTenantId(), platformCode));
    }

    /**
     * D-587：手动粘贴授权码换 token（回调地址不便配置的平台兜底）
     */
    @PostMapping("/oauth/{platformCode}/exchange")
    public Result<Map<String, Object>> exchangeCode(
            @PathVariable String platformCode,
            @RequestBody Map<String, Object> body) {
        return platformConnectorOrchestrator.exchangeCode(TenantAssert.requireTenantId(), platformCode, body);
    }

    /**
     * D-587：授权状态查询（前端轮询：商家在平台确认授权后回到系统，前端轮询此接口刷新状态）
     */
    @GetMapping("/oauth/{platformCode}/auth-status")
    public Result<Map<String, Object>> authStatus(@PathVariable String platformCode) {
        return Result.success(
                platformConnectorOrchestrator.authStatus(TenantAssert.requireTenantId(), platformCode));
    }

    /**
     * 连接测试 + 自动发现店铺
     */
    @PostMapping("/test-connection")
    public Result<Map<String, Object>> testConnection(@RequestBody Map<String, Object> body) {
        return platformConnectorOrchestrator.testConnection(TenantAssert.requireTenantId(), body);
    }

    /**
     * 手动触发同步（聚水潭当前支持）
     */
    @PostMapping("/sync-now")
    public Result<Map<String, Object>> syncNow(@RequestBody Map<String, Object> body) {
        return platformConnectorOrchestrator.syncNow(TenantAssert.requireTenantId(), body);
    }

    /**
     * 获取所有支持的平台及说明
     */
    @GetMapping("/supported-platforms")
    public Result<List<Map<String, Object>>> getSupportedPlatforms() {
        return Result.success(platformConnectorOrchestrator.listSupportedPlatforms());
    }

    /**
     * 获取平台店铺数据统计（今日销量/订单/缺货等）
     */
    @GetMapping("/shop-stats")
    public Result<Map<String, Object>> getShopStats(@RequestParam(required = false) String platformCode) {
        return Result.success(
                platformConnectorOrchestrator.getShopStats(TenantAssert.requireTenantId(), platformCode));
    }
}
