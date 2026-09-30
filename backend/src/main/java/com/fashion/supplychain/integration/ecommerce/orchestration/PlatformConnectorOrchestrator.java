package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.helper.EcPlatformOAuthHelper;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.PddOrderSyncService;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.orchestration.AppStoreOrchestrator;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 外部平台对接编排层（连接测试 / 授权 / 手动同步 / 店铺统计）
 *
 * <p>原 {@code PlatformConnectorController} 直接注入了 5 个 Service
 * （{@code EcPlatformConfigService}、{@code JushuitanSyncOrchestrator}（原 JushuitanSyncService，D-663 上移编排）、
 * {@code EcPlatformOAuthService}（D-664 已更名 EcPlatformOAuthHelper）、{@code PddOrderSyncService}、{@code EcommerceOrderService}），
 * 违反 ArchUnit 规则6（Controller 不得直接依赖多个 Service）。本类承接其全部业务逻辑。
 *
 * <p>⚠️ 所有数据库写操作仍统一经由 {@link EcPlatformConfigOrchestrator} 执行，
 * 本类不直接调用 Service 的 save/update/delete。
 *
 * <p>租户上下文由 Controller 显式传入（编排层不读线程上下文），便于直接 new 出来单测。
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class PlatformConnectorOrchestrator {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private EcPlatformConfigOrchestrator ecPlatformConfigOrchestrator;

    @Autowired
    private JushuitanSyncOrchestrator jushuitanSyncOrchestrator;

    @Autowired
    private EcPlatformOAuthHelper ecPlatformOAuthHelper;

    @Autowired
    private PddOrderSyncService pddOrderSyncService;

    @Autowired
    private EcommerceOrderService ecommerceOrderService;

    @Autowired
    private AppStoreOrchestrator appStoreOrchestrator;

    /**
     * D-588 闭环卡点：平台对接为增值服务，租户须有 EC_{platform} 有效订阅
     * （含自助 7 天试用 / 平台总管授予的正式订阅）才能保存配置或发起授权。
     */
    public void requireEcSubscription(Long tenantId, String platformCode) {
        appStoreOrchestrator.requireEcSubscription(tenantId, platformCode);
    }

    /**
     * 保存平台凭证（AppKey + AppSecret）及向导带上的接入模式 / 平台店铺ID。
     */
    public Result<Map<String, Object>> saveConfig(Long tenantId, Map<String, Object> body) {
        String platformCode = (String) body.get("platformCode");
        requireEcSubscription(tenantId, platformCode);
        String appKey = (String) body.get("appKey");
        String appSecret = (String) body.get("appSecret");
        String shopName = (String) body.get("shopName");
        String callbackUrl = (String) body.get("callbackUrl");
        String authMode = (String) body.get("authMode");
        String shopCode = (String) body.get("shopCode");

        if (!isSupported(platformCode)) {
            return Result.fail("不支持的平台: " + platformCode);
        }

        ecPlatformConfigOrchestrator.saveOrUpdateConfig(tenantId, platformCode,
                appKey, appSecret, shopName, callbackUrl);
        // D-587：向导带上接入模式与平台店铺ID
        if (authMode != null || shopCode != null) {
            EcPlatformConfig saved = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
            if (saved != null) {
                if (authMode != null) saved.setAuthMode(authMode);
                if (shopCode != null) saved.setShopCode(shopCode);
                ecPlatformConfigService.updateById(saved);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("saved", true);
        result.put("platformCode", platformCode);
        return Result.success(result);
    }

    /**
     * 获取平台配置状态（含 D-587 的 OAuth 授权状态，向导第三步轮询用）。
     */
    public Map<String, Object> getConfigStatus(Long tenantId, String platformCode) {
        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformCode", platformCode);
        result.put("configured", config != null && config.getAppKey() != null);
        result.put("status", config != null ? config.getStatus() : "DISCONNECTED");
        if (config != null) {
            result.put("shopName", config.getShopName());
            result.put("appKey", maskKey(config.getAppKey()));
        }
        // D-587：OAuth 授权状态（向导第三步轮询用）
        result.put("oauthSupported", EcPlatformOAuthHelper.isOAuthPlatform(platformCode));
        result.put("authorized", config != null && config.getAccessToken() != null && !config.getAccessToken().isBlank());
        if (config != null) {
            result.put("authMode", config.getAuthMode());
            result.put("authorizedAt", config.getAuthorizedAt());
            result.put("tokenExpiresAt", config.getTokenExpiresAt());
        }
        return result;
    }

    /**
     * D-587：生成跳转平台授权页的 URL。
     */
    public Map<String, Object> buildAuthorizeUrl(Long tenantId, String platformCode) {
        requireEcSubscription(tenantId, platformCode);
        return ecPlatformOAuthHelper.buildAuthorizeUrl(tenantId, platformCode);
    }

    /**
     * D-587：手动粘贴授权码换 token（回调地址不便配置的平台兜底）。
     */
    public Result<Map<String, Object>> exchangeCode(Long tenantId, String platformCode, Map<String, Object> body) {
        requireEcSubscription(tenantId, platformCode);
        String code = body == null ? null : (String) body.get("code");
        if (code == null || code.isBlank()) {
            return Result.fail("请粘贴平台返回的授权码");
        }
        Map<String, Object> result = ecPlatformOAuthHelper.exchangeManually(tenantId, platformCode, code.trim());
        if (!Boolean.TRUE.equals(result.get("success"))) {
            return Result.fail(String.valueOf(result.getOrDefault("message", "授权失败")));
        }
        return Result.success(result);
    }

    /**
     * D-587：授权状态查询（前端轮询：商家在平台确认授权后回到系统，前端轮询此接口刷新状态）。
     */
    public Map<String, Object> authStatus(Long tenantId, String platformCode) {
        return ecPlatformOAuthHelper.authStatus(tenantId, platformCode);
    }

    /**
     * 连接测试 + 自动发现店铺。
     */
    public Result<Map<String, Object>> testConnection(Long tenantId, Map<String, Object> body) {
        String platformCode = (String) body.get("platformCode");

        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
        if (config == null || config.getAppKey() == null) {
            return Result.fail("请先配置平台凭证");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformCode", platformCode);

        switch (platformCode) {
            case "JST" -> {
                Map<String, Object> verifyResult = jushuitanSyncOrchestrator.verifyConnection(config);
                result.putAll(verifyResult);
                result.put("supportedActions", List.of("拉取订单", "店铺发现", "物流回传"));
            }
            case "TAOBAO", "TMALL" -> {
                result.put("success", config.getAppSecret() != null && !config.getAppSecret().isBlank());
                result.put("message", config.getAppSecret() != null && !config.getAppSecret().isBlank()
                        ? "凭证已保存，请在淘宝开放平台设置回调地址"
                        : "请先填写真实的 AppKey 和 AppSecret");
                result.put("webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode);
                result.put("credentialGuide", "打开 open.taobao.com → 应用管理 → 获取 AppKey/AppSecret");
                result.put("supportedActions", List.of("订单接收", "物流回传", "库存同步"));
            }
            case "DOUYIN" -> {
                result.put("success", config.getAppSecret() != null && !config.getAppSecret().isBlank());
                result.put("message", config.getAppSecret() != null && !config.getAppSecret().isBlank()
                        ? "凭证已保存，请在抖音开放平台设置回调地址"
                        : "请先填写真实的 AppKey 和 AppSecret");
                result.put("webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode);
                result.put("credentialGuide", "打开 open.douyin.com → 应用管理 → 获取 AppKey/AppSecret");
                result.put("supportedActions", List.of("订单接收", "物流回传"));
            }
            case "PINDUODUO" -> {
                result.put("success", config.getAppSecret() != null && !config.getAppSecret().isBlank());
                result.put("message", config.getAppSecret() != null && !config.getAppSecret().isBlank()
                        ? "凭证已保存，请在拼多多开放平台设置回调地址"
                        : "请先填写真实的 AppKey 和 AppSecret");
                result.put("webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode);
                result.put("credentialGuide", "打开 open.pinduoduo.com → 应用管理 → 获取 client_id/client_secret");
                result.put("supportedActions", List.of("订单接收", "物流回传"));
            }
            case "JD" -> {
                result.put("success", config.getAppSecret() != null && !config.getAppSecret().isBlank());
                result.put("message", config.getAppSecret() != null && !config.getAppSecret().isBlank()
                        ? "凭证已保存，请在京东开放平台设置回调地址"
                        : "请先填写真实的 AppKey 和 AppSecret");
                result.put("webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode);
                result.put("credentialGuide", "打开 open.jd.com → 应用管理 → 获取 AppKey/AppSecret");
                result.put("supportedActions", List.of("订单接收", "物流回传"));
            }
            case "XIAOHONGSHU" -> {
                result.put("success", config.getAppSecret() != null && !config.getAppSecret().isBlank());
                result.put("message", config.getAppSecret() != null && !config.getAppSecret().isBlank()
                        ? "凭证已保存，请在小红书开放平台设置回调地址"
                        : "请先填写真实的 AppKey 和 AppSecret");
                result.put("webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode);
                result.put("credentialGuide", "打开 open.xiaohongshu.com → 应用管理 → 获取 AppKey/AppSecret");
                result.put("supportedActions", List.of("订单接收", "物流回传"));
            }
            case "WECHAT_SHOP" -> {
                result.put("success", config.getAppSecret() != null && !config.getAppSecret().isBlank());
                result.put("message", config.getAppSecret() != null && !config.getAppSecret().isBlank()
                        ? "凭证已保存，请在微信小店后台设置回调地址"
                        : "请先填写真实的 AppKey 和 AppSecret");
                result.put("webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode);
                result.put("credentialGuide", "打开微信小店后台 → 开发设置 → 获取 AppID/AppSecret");
                result.put("supportedActions", List.of("订单接收", "物流回传"));
            }
            case "SHOPIFY" -> {
                result.put("success", config.getAppSecret() != null && !config.getAppSecret().isBlank());
                result.put("message", config.getAppSecret() != null && !config.getAppSecret().isBlank()
                        ? "凭证已保存，请在 Shopify 后台设置 Webhook 回调地址"
                        : "请先填写真实的 API Key 和 API Secret");
                result.put("webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode);
                result.put("credentialGuide", "打开 Shopify 后台 → 设置 → 应用 → 管理私有应用 → 获取 API 凭证");
                result.put("supportedActions", List.of("订单接收", "物流回传"));
            }
            case "SHEIN" -> {
                result.put("success", config.getAppSecret() != null && !config.getAppSecret().isBlank());
                result.put("message", config.getAppSecret() != null && !config.getAppSecret().isBlank()
                        ? "凭证已保存，请将回调地址配置到希音平台"
                        : "请先填写真实的 AppKey 和 AppSecret");
                result.put("webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode);
                result.put("credentialGuide", "联系希音平台获取 API 凭证");
                result.put("supportedActions", List.of("订单同步", "物流回传", "库存同步"));
            }
            default -> {
                result.put("success", true);
                result.put("message", "平台 " + platformCode + " 支持 Webhook 实时推送");
                result.put("webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode);
                result.put("supportedActions", List.of("订单接收", "物流回传"));
            }
        }

        return Result.success(result);
    }

    /**
     * 手动触发同步（聚水潭当前支持）。
     */
    public Result<Map<String, Object>> syncNow(Long tenantId, Map<String, Object> body) {
        String platformCode = (String) body.get("platformCode");

        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
        if (config == null || config.getAppKey() == null) {
            return Result.fail("请先配置平台凭证");
        }

        switch (platformCode) {
            case "JST" -> {
                Map<String, Object> syncResult = jushuitanSyncOrchestrator.syncOrders(config, tenantId, null);
                return Result.success(syncResult);
            }
            case "PINDUODUO" -> {
                // D-589 拼多多直连拉单样板：增量拉取近24小时订单并幂等入库
                requireEcSubscription(tenantId, platformCode);
                Map<String, Object> syncResult = pddOrderSyncService.pullOrders(config, null);
                syncResult.put("platform", platformCode);
                return Result.success(syncResult);
            }
            case "TAOBAO", "TMALL", "DOUYIN", "JD",
                 "XIAOHONGSHU", "WECHAT_SHOP", "SHOPIFY", "SHEIN" -> {
                return Result.success(Map.of(
                        "platform", platformCode,
                        "message", "该平台使用 Webhook 实时推送，无需手动同步",
                        "webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode
                ));
            }
            default -> {
                return Result.success(Map.of(
                        "platform", platformCode,
                        "message", "该平台使用 Webhook 实时推送，请配置回调地址",
                        "webhookUrl", "/api/webhook/ecommerce/" + tenantId + "/" + platformCode
                ));
            }
        }
    }

    /**
     * 获取所有支持的平台及说明。
     */
    public List<Map<String, Object>> listSupportedPlatforms() {
        List<Map<String, Object>> platforms = new ArrayList<>();

        platforms.add(platformInfo("JST", "聚水潭", "电商ERP中台，聚合淘宝/京东/拼多多等多平台订单",
                "主动拉取 + Webhook", List.of("订单同步", "店铺发现", "客户归集", "物流回传"),
                "https://open.jushuitan.com", 299.00));

        platforms.add(platformInfo("SHEIN", "希音", "希音(SHEIN)跨境电商平台订单对接",
                "Webhook 回调", List.of("订单同步", "物流回传", "库存同步"),
                "https://open.shein.com", 299.00));

        platforms.add(platformInfo("TAOBAO", "淘宝", "淘宝平台订单与物流对接，Webhook 实时推送",
                "Webhook 实时推送",
                List.of("订单导入", "库存同步", "物流回传"),
                "https://open.taobao.com", 149.00));

        platforms.add(platformInfo("TMALL", "天猫", "天猫平台订单与物流对接", "Webhook 实时推送",
                List.of("订单导入", "库存同步", "物流回传"), "https://open.taobao.com", 199.00));

        platforms.add(platformInfo("DOUYIN", "抖音", "抖音小店直播带货订单管理", "Webhook 实时推送",
                List.of("订单导入", "物流回传"), "https://open.douyin.com", 299.00));

        platforms.add(platformInfo("JD", "京东", "京东平台订单对接", "Webhook 实时推送",
                List.of("订单导入", "物流回传"), "https://open.jd.com", 199.00));

        platforms.add(platformInfo("PINDUODUO", "拼多多", "拼多多平台订单对接", "Webhook 实时推送",
                List.of("订单导入", "物流回传"), "https://open.pinduoduo.com", 149.00));

        platforms.add(platformInfo("XIAOHONGSHU", "小红书", "小红书平台订单对接", "Webhook 实时推送",
                List.of("订单导入", "物流回传"), "https://open.xiaohongshu.com", 199.00));

        platforms.add(platformInfo("WECHAT_SHOP", "微信小店", "微信视频号小店订单对接", "Webhook 实时推送",
                List.of("订单导入", "物流回传"), "https://developers.weixin.qq.com", 149.00));

        platforms.add(platformInfo("SHOPIFY", "Shopify", "跨境电商独立站订单对接", "Webhook 实时推送",
                List.of("订单导入", "物流回传"), "https://shopify.dev", 299.00));

        return platforms;
    }

    /**
     * 获取平台店铺数据统计（今日销量/订单/缺货等）。
     */
    public Map<String, Object> getShopStats(Long tenantId, String platformCode) {
        if (platformCode == null || platformCode.isBlank()) {
            // 未指定平台时返回聚合统计
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("platformCode", "ALL");
            stats.put("configured", false);
            stats.put("totalOrders", 0);
            stats.put("todayOrders", 0);
            stats.put("todaySales", "0.00");
            stats.put("totalSales", "0.00");
            stats.put("avgOrderValue", "0.00");
            stats.put("shopCount", 0);
            return stats;
        }
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
            return stats;
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
        BigDecimal totalSales;
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
                ? totalSales.divide(BigDecimal.valueOf(totalOrders), 2, RoundingMode.HALF_UP).toPlainString()
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

        return stats;
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
        return Set.of("JST", "SHEIN", "TAOBAO", "TMALL", "JD", "DOUYIN",
                "PINDUODUO", "XIAOHONGSHU", "WECHAT_SHOP", "SHOPIFY").contains(code);
    }

    private String maskKey(String key) {
        if (key == null || key.length() <= 8) return "****";
        return key.substring(0, 4) + "****" + key.substring(key.length() - 4);
    }
}
