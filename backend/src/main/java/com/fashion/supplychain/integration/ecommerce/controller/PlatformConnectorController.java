package com.fashion.supplychain.integration.ecommerce.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.JushuitanSyncService;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

/**
 * 外部平台对接管理 Controller
 * 提供连接测试、店铺发现、手动同步等"傻瓜式"操作
 */
@Slf4j
@RestController
@RequestMapping("/api/platform-connector")
@PreAuthorize("isAuthenticated()")
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class PlatformConnectorController {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private JushuitanSyncService jushuitanSyncService;

    @Autowired
    private EcommerceOrderService ecommerceOrderService;

    /**
     * 保存平台凭证（AppKey + AppSecret）
     */
    @PostMapping("/save-config")
    public Result<Map<String, Object>> saveConfig(@RequestBody Map<String, Object> body) {
        Long tenantId = TenantAssert.requireTenantId();
        String platformCode = (String) body.get("platformCode");
        String appKey = (String) body.get("appKey");
        String appSecret = (String) body.get("appSecret");
        String shopName = (String) body.get("shopName");
        String callbackUrl = (String) body.get("callbackUrl");

        if (!isSupported(platformCode)) {
            return Result.fail("不支持的平台: " + platformCode);
        }

        EcPlatformConfig existing = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
        if (existing != null) {
            existing.setAppKey(appKey);
            if (appSecret != null && !appSecret.equals("****")) {
                existing.setAppSecret(appSecret);
            }
            if (shopName != null) existing.setShopName(shopName);
            if (callbackUrl != null) existing.setCallbackUrl(callbackUrl);
            existing.setStatus("ACTIVE");
            ecPlatformConfigService.updateById(existing);
        } else {
            EcPlatformConfig config = new EcPlatformConfig();
            config.setTenantId(tenantId);
            config.setPlatformCode(platformCode);
            config.setAppKey(appKey);
            config.setAppSecret(appSecret);
            config.setShopName(shopName);
            config.setCallbackUrl(callbackUrl);
            config.setStatus("ACTIVE");
            ecPlatformConfigService.save(config);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("saved", true);
        result.put("platformCode", platformCode);
        return Result.success(result);
    }

    /**
     * 获取平台配置状态
     */
    @GetMapping("/config-status")
    public Result<Map<String, Object>> getConfigStatus(
            @RequestParam String platformCode) {
        Long tenantId = TenantAssert.requireTenantId();
        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformCode", platformCode);
        result.put("configured", config != null && config.getAppKey() != null);
        result.put("status", config != null ? config.getStatus() : "DISCONNECTED");
        if (config != null) {
            result.put("shopName", config.getShopName());
            result.put("appKey", maskKey(config.getAppKey()));
        }
        return Result.success(result);
    }

    /**
     * 连接测试 + 自动发现店铺
     */
    @PostMapping("/test-connection")
    public Result<Map<String, Object>> testConnection(@RequestBody Map<String, Object> body) {
        Long tenantId = TenantAssert.requireTenantId();
        String platformCode = (String) body.get("platformCode");

        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
        if (config == null || config.getAppKey() == null) {
            return Result.fail("请先配置平台凭证");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformCode", platformCode);

        switch (platformCode) {
            case "JST" -> {
                Map<String, Object> verifyResult = jushuitanSyncService.verifyConnection(config);
                result.putAll(verifyResult);
                result.put("supportedActions", List.of("拉取订单", "店铺发现", "物流回传"));
            }
            case "DONGFANG" -> {
                result.put("success", true);
                result.put("message", "东纺纺织连接确认（开发中，订单同步暂通过Webhook回调）");
                result.put("supportedActions", List.of("面料同步", "供应商对接", "采购订单"));
            }
            default -> {
                result.put("success", true);
                result.put("message", "平台 " + platformCode + " 支持 Webhook 实时推送，请配置回调地址后使用");
                result.put("supportedActions", List.of("订单接收", "物流回传"));
            }
        }

        return Result.success(result);
    }

    /**
     * 手动触发同步（聚水潭当前支持）
     */
    @PostMapping("/sync-now")
    public Result<Map<String, Object>> syncNow(@RequestBody Map<String, Object> body) {
        Long tenantId = TenantAssert.requireTenantId();
        String platformCode = (String) body.get("platformCode");

        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
        if (config == null || config.getAppKey() == null) {
            return Result.fail("请先配置平台凭证");
        }

        switch (platformCode) {
            case "JST" -> {
                Map<String, Object> syncResult = jushuitanSyncService.syncOrders(config, tenantId, null);
                return Result.success(syncResult);
            }
            default -> {
                return Result.fail("平台 " + platformCode + " 暂不支持手动拉取，请使用 Webhook 自动接收");
            }
        }
    }

    /**
     * 获取所有支持的平台及说明
     */
    @GetMapping("/supported-platforms")
    public Result<List<Map<String, Object>>> getSupportedPlatforms() {
        List<Map<String, Object>> platforms = new ArrayList<>();

        platforms.add(platformInfo("JST", "聚水潭", "电商ERP中台，聚合淘宝/京东/拼多多等多平台订单",
                "主动拉取 + Webhook", List.of("订单同步", "店铺发现", "客户归集", "物流回传"),
                "https://open.jushuitan.com", 299.00));

        platforms.add(platformInfo("DONGFANG", "东纺纺织", "纺织面料B2B平台，面料采购与供应链协同",
                "Webhook 回调", List.of("面料同步", "供应商对接", "采购订单", "库存联动"),
                "", 199.00));

        platforms.add(platformInfo("TAOBAO", "淘宝", "淘宝平台订单与物流对接", "Webhook 实时推送",
                List.of("订单导入", "库存同步", "物流回传"), "https://open.taobao.com", 149.00));

        platforms.add(platformInfo("DOUYIN", "抖音", "抖音小店直播带货订单管理", "Webhook 实时推送",
                List.of("订单导入", "物流回传"), "https://open.douyin.com", 299.00));

        return Result.success(platforms);
    }

    /**
     * 获取平台店铺数据统计（今日销量/订单/缺货等）
     */
    @GetMapping("/shop-stats")
    public Result<Map<String, Object>> getShopStats(@RequestParam String platformCode) {
        Long tenantId = TenantAssert.requireTenantId();
        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("platformCode", platformCode);
        stats.put("configured", config != null && config.getAppKey() != null);

        if (config == null) {
            stats.put("totalOrders", 0);
            stats.put("todayOrders", 0);
            stats.put("todaySales", "0.00");
            stats.put("totalSales", "0.00");
            stats.put("avgOrderValue", "0.00");
            stats.put("shopCount", 0);
            return Result.success(stats);
        }

        // 今日订单统计
        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);

        LambdaQueryWrapper<EcommerceOrder> todayWrapper = new LambdaQueryWrapper<>();
        todayWrapper.eq(EcommerceOrder::getTenantId, tenantId)
                .eq(EcommerceOrder::getSourcePlatformCode, platformCode)
                .between(EcommerceOrder::getCreateTime, todayStart, todayEnd);
        List<EcommerceOrder> todayOrders = ecommerceOrderService.list(todayWrapper);

        // 全部订单统计
        LambdaQueryWrapper<EcommerceOrder> allWrapper = new LambdaQueryWrapper<>();
        allWrapper.eq(EcommerceOrder::getTenantId, tenantId)
                .eq(EcommerceOrder::getSourcePlatformCode, platformCode);
        long totalOrders = ecommerceOrderService.count(allWrapper);

        // 计算金额
        BigDecimal todaySales = todayOrders.stream()
                .map(o -> o.getPayAmount() != null ? o.getPayAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalSales = BigDecimal.ZERO;
        try {
            List<EcommerceOrder> all = ecommerceOrderService.list(allWrapper);
            totalSales = all.stream()
                    .map(o -> o.getPayAmount() != null ? o.getPayAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            totalSales = todaySales;
        }

        stats.put("totalOrders", totalOrders);
        stats.put("todayOrders", todayOrders.size());
        stats.put("todaySales", todaySales.toPlainString());
        stats.put("totalSales", totalSales.toPlainString());
        stats.put("avgOrderValue", totalOrders > 0
                ? totalSales.divide(BigDecimal.valueOf(totalOrders), 2, java.math.RoundingMode.HALF_UP).toPlainString()
                : "0.00");
        stats.put("shopCount", todayOrders.stream().map(EcommerceOrder::getShopName).filter(Objects::nonNull).distinct().count());
        stats.put("lastSyncTime", config.getUpdatedAt() != null ? config.getUpdatedAt().toString() : null);

        // 仓库状态统计：待拣货(0) / 备货中(1) / 已出库(2) / 待发货(status=1)
        long pendingPick = todayOrders.stream().filter(o -> o.getWarehouseStatus() != null && o.getWarehouseStatus() == 0).count();
        long preparing = todayOrders.stream().filter(o -> o.getWarehouseStatus() != null && o.getWarehouseStatus() == 1).count();
        long shipped = todayOrders.stream().filter(o -> o.getWarehouseStatus() != null && o.getWarehouseStatus() >= 2).count();
        long pendingShip = todayOrders.stream().filter(o -> o.getStatus() != null && o.getStatus() == 1).count();

        stats.put("pendingPick", pendingPick);
        stats.put("preparing", preparing);
        stats.put("shippedToday", shipped);
        stats.put("pendingShip", pendingShip);

        // 缺货预警：待拣货但未关联生产单的 = 电商仓现货找不到对应SKU
        long noStockWarn = todayOrders.stream()
                .filter(o -> o.getWarehouseStatus() != null && o.getWarehouseStatus() == 0)
                .filter(o -> o.getProductionOrderNo() == null)
                .count();
        stats.put("noStockWarn", noStockWarn);

        return Result.success(stats);
    }

    private Map<String, Object> platformInfo(String code, String name, String desc,
                                              String mode, List<String> features,
                                              String docUrl, double monthlyPrice) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", code);
        m.put("name", name);
        m.put("desc", desc);
        m.put("syncMode", mode);
        m.put("features", features);
        m.put("docUrl", docUrl);
        m.put("monthlyPrice", monthlyPrice);
        return m;
    }

    private boolean isSupported(String code) {
        return Set.of("JST", "DONGFANG", "TAOBAO", "TMALL", "JD", "DOUYIN",
                "PINDUODUO", "XIAOHONGSHU", "WECHAT_SHOP", "SHOPIFY", "SHEIN").contains(code);
    }

    private String maskKey(String key) {
        if (key == null || key.length() <= 8) return "****";
        return key.substring(0, 4) + "****" + key.substring(key.length() - 4);
    }
}
