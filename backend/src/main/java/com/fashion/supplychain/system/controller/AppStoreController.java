package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.AppOrder;
import com.fashion.supplychain.system.entity.AppStore;
import com.fashion.supplychain.system.entity.TenantSubscription;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.openapi.dto.TenantAppRequest;
import com.fashion.supplychain.integration.openapi.dto.TenantAppResponse;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import com.fashion.supplychain.system.service.AppOrderService;
import com.fashion.supplychain.system.service.AppStoreService;
import com.fashion.supplychain.system.service.TenantSubscriptionService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 应用商店Controller
 */
@Slf4j
@RestController
@RequestMapping("/api/system/app-store")
@PreAuthorize("isAuthenticated()")
public class AppStoreController {

    @Autowired
    private AppStoreService appStoreService;

    @Autowired
    private AppOrderService appOrderService;

    @Autowired
    private TenantSubscriptionService tenantSubscriptionService;

    @Autowired
    private TenantAppOrchestrator tenantAppOrchestrator;

    /**
     * 获取应用列个表
     */
    @PostMapping("/list")
    public Result<List<AppStore>> list(@RequestBody(required = false) Map<String, Object> params) {
        QueryWrapper<AppStore> wrapper = new QueryWrapper<>();

        // 状态过滤
        if (params != null && params.containsKey("status")) {
            wrapper.eq("status", params.get("status"));
        } else {
            wrapper.eq("status", "PUBLISHED");
        }

        // 分类过滤
        if (params != null && params.containsKey("category")) {
            wrapper.eq("category", params.get("category"));
        }

        wrapper.orderByAsc("sort_order");

        List<AppStore> appList = appStoreService.list(wrapper);

        // 解析JSON字段
        for (AppStore app : appList) {
            appStoreService.parseJsonFields(app);
        }

        return Result.success(appList);
    }

    /**
     * 获取应用详情
     */
    @GetMapping("/{id}")
    public Result<AppStore> getDetail(@PathVariable Long id) {
        AppStore app = appStoreService.getByIdWithJson(id);
        if (app == null) {
            return Result.fail("应用不存在");
        }
        return Result.success(app);
    }

    /**
     * 创建订单
     */
    @PostMapping("/create-order")
    public Result<AppOrder> createOrder(@RequestBody CreateOrderRequest request) {
        try {
            // 1. 查询应用信息
            AppStore app = appStoreService.getById(request.getAppId());
            if (app == null) {
                return Result.fail("应用不存在");
            }

            // 2. 计算价格
            BigDecimal unitPrice = calculatePrice(app, request.getSubscriptionType());
            BigDecimal totalAmount = unitPrice.multiply(BigDecimal.valueOf(request.getUserCount()));
            BigDecimal discountAmount = BigDecimal.ZERO; // 暂无优惠
            BigDecimal actualAmount = totalAmount.subtract(discountAmount);

            // 3. 创建订单
            AppOrder order = new AppOrder();
            order.setOrderNo(appOrderService.generateOrderNo());
            Long tenantId = UserContext.tenantId();
            order.setTenantId(tenantId != null ? tenantId : 0L);
            UserContext ctx = UserContext.get();
            order.setTenantName(ctx != null && ctx.getUsername() != null ? ctx.getUsername() : "未知租户");
            order.setAppId(app.getId());
            order.setAppCode(app.getAppCode());
            order.setAppName(app.getAppName());
            order.setOrderType("NEW");
            order.setSubscriptionType(request.getSubscriptionType());
            order.setUserCount(request.getUserCount());
            order.setUnitPrice(unitPrice);
            order.setTotalAmount(totalAmount);
            order.setDiscountAmount(discountAmount);
            order.setActualAmount(actualAmount);
            order.setStatus("PENDING");
            order.setContactName(request.getContactName());
            order.setContactPhone(request.getContactPhone());
            order.setContactEmail(request.getContactEmail());
            order.setCompanyName(request.getCompanyName());
            order.setInvoiceRequired(request.getInvoiceRequired());
            order.setInvoiceTitle(request.getInvoiceTitle());
            order.setInvoiceTaxNo(request.getInvoiceTaxNo());
            UserContext ctxOrder = UserContext.get();
            order.setCreatedBy(ctxOrder != null ? ctxOrder.getUsername() : "system");

            appOrderService.save(order);

            log.info("创建应用订单成功：{}", order.getOrderNo());
            return Result.success(order);

        } catch (Exception e) {
            log.error("创建订单失败", e);
            return Result.fail("创建订单失败：" + e.getMessage());
        }
    }

    /**
     * 开通免费试用（7天）
     * 支持一步到位：可同时传入 callbackUrl / externalApiUrl，自动配置API对接
     */
    @PostMapping("/start-trial")
    public Result<?> startTrial(@RequestBody Map<String, Object> params) {
        try {
            Long appId = Long.valueOf(params.get("appId").toString());
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) tenantId = 0L;

            // 获取可选的 URL 参数（一键配置）
            String callbackUrl = params.get("callbackUrl") != null ? params.get("callbackUrl").toString().trim() : null;
            String externalApiUrl = params.get("externalApiUrl") != null ? params.get("externalApiUrl").toString().trim() : null;

            // 1. 查询应用信息
            AppStore app = appStoreService.getById(appId);
            if (app == null) {
                return Result.fail("应用不存在");
            }

            // 2. 检查是否支持试用
            if (app.getTrialDays() == null || app.getTrialDays() <= 0) {
                return Result.fail("该应用不支持免费试用");
            }

            // 3. 检查是否已经试用过（每个租户每个应用只能试用一次）
            QueryWrapper<TenantSubscription> checkWrapper = new QueryWrapper<>();
            checkWrapper.eq("tenant_id", tenantId);
            checkWrapper.eq("app_id", appId);
            checkWrapper.eq("subscription_type", "TRIAL");
            long trialCount = tenantSubscriptionService.count(checkWrapper);
            if (trialCount > 0) {
                return Result.fail("您已试用过该应用，每个应用仅可试用一次");
            }

            // 4. 检查是否已有有效订阅
            QueryWrapper<TenantSubscription> activeWrapper = new QueryWrapper<>();
            activeWrapper.eq("tenant_id", tenantId);
            activeWrapper.eq("app_id", appId);
            activeWrapper.in("status", "ACTIVE", "TRIAL");
            activeWrapper.gt("end_time", LocalDateTime.now());
            long activeCount = tenantSubscriptionService.count(activeWrapper);
            if (activeCount > 0) {
                return Result.fail("您已有该应用的有效订阅，无需再试用");
            }

            // 5. 创建试用订阅
            TenantSubscription subscription = new TenantSubscription();
            subscription.setSubscriptionNo(tenantSubscriptionService.generateSubscriptionNo());
            subscription.setTenantId(tenantId);
            UserContext ctx2 = UserContext.get();
            subscription.setTenantName(ctx2 != null && ctx2.getUsername() != null ? ctx2.getUsername() : "未知租户");
            subscription.setAppId(app.getId());
            subscription.setAppCode(app.getAppCode());
            subscription.setAppName(app.getAppName());
            subscription.setSubscriptionType("TRIAL");
            subscription.setPrice(BigDecimal.ZERO);
            subscription.setUserCount(1);
            subscription.setStartTime(LocalDateTime.now());
            subscription.setEndTime(LocalDateTime.now().plusDays(app.getTrialDays()));
            subscription.setStatus("TRIAL");
            subscription.setAutoRenew(false);
            UserContext ctx3 = UserContext.get();
            subscription.setCreatedBy(ctx3 != null ? ctx3.getUsername() : "system");
            subscription.setRemark("免费试用" + app.getTrialDays() + "天");

            tenantSubscriptionService.save(subscription);

            // 6. 自动创建 TenantApp（API对接凭证），同时自动配置URL
            TenantAppResponse appCredentials = null;
            try {
                TenantAppRequest appRequest = new TenantAppRequest();
                appRequest.setAppName(app.getAppName() + "(试用)");
                appRequest.setAppType(app.getAppCode());
                appRequest.setDailyQuota(100);
                appRequest.setRemark("试用自动创建 - 订阅号: " + subscription.getSubscriptionNo());
                String expireTime = subscription.getEndTime().toString();
                appRequest.setExpireTime(expireTime);
                // 一键配置：传入URL
                if (callbackUrl != null && !callbackUrl.isEmpty()) {
                    appRequest.setCallbackUrl(callbackUrl);
                }
                if (externalApiUrl != null && !externalApiUrl.isEmpty()) {
                    appRequest.setExternalApiUrl(externalApiUrl);
                }
                appCredentials = tenantAppOrchestrator.createApp(tenantId, appRequest);
                log.info("试用自动创建API凭证: appKey={}", appCredentials.getAppKey());
            } catch (Exception ex) {
                log.warn("试用自动创建API凭证失败（不影响试用）: {}", ex.getMessage());
            }

            log.info("应用试用开通成功：{} - 租户 {} - 到期 {}",
                app.getAppName(), tenantId, subscription.getEndTime());

            // 7. 构建API端点信息（告诉前端这个模块包含哪些端点）
            List<Map<String, String>> apiEndpoints = getApiEndpointsForModule(app.getAppCode());

            // 返回订阅信息 + API凭证 + 端点信息
            Map<String, Object> responseData = new java.util.HashMap<>();
            responseData.put("subscription", subscription);
            responseData.put("apiEndpoints", apiEndpoints);
            responseData.put("appCode", app.getAppCode());
            responseData.put("appName", app.getAppName());
            if (appCredentials != null) {
                responseData.put("apiCredentials", Map.of(
                    "appKey", appCredentials.getAppKey(),
                    "appSecret", appCredentials.getAppSecret(),
                    "appId", appCredentials.getId(),
                    "message", "⚠️ 请保存以下API密钥，仅显示一次！"
                ));
            }
            return Result.success(responseData);

        } catch (Exception e) {
            log.error("开通试用失败", e);
            return Result.fail("开通试用失败：" + e.getMessage());
        }
    }

    /**
     * 快速配置已开通的应用（填写对方API地址即可使用）
     * 用户购买/试用后，调用此接口一键配置回调URL和外部API地址
     */
    @PostMapping("/quick-setup")
    public Result<?> quickSetup(@RequestBody Map<String, Object> params) {
        try {
            String tenantAppId = params.get("tenantAppId") != null ? params.get("tenantAppId").toString() : null;
            String callbackUrl = params.get("callbackUrl") != null ? params.get("callbackUrl").toString().trim() : null;
            String externalApiUrl = params.get("externalApiUrl") != null ? params.get("externalApiUrl").toString().trim() : null;

            if (tenantAppId == null || tenantAppId.isEmpty()) {
                return Result.fail("请指定要配置的应用ID");
            }

            Long tenantId = UserContext.tenantId();
            if (tenantId == null) tenantId = 0L;

            TenantAppRequest updateReq = new TenantAppRequest();
            if (callbackUrl != null && !callbackUrl.isEmpty()) {
                updateReq.setCallbackUrl(callbackUrl);
            }
            if (externalApiUrl != null && !externalApiUrl.isEmpty()) {
                updateReq.setExternalApiUrl(externalApiUrl);
            }

            TenantAppResponse updated = tenantAppOrchestrator.updateApp(tenantAppId, tenantId, updateReq);
            log.info("快速配置完成: tenantAppId={}, callbackUrl={}, externalApiUrl={}", tenantAppId, callbackUrl, externalApiUrl);

            return Result.success(updated);
        } catch (Exception e) {
            log.error("快速配置失败", e);
            return Result.fail("配置失败：" + e.getMessage());
        }
    }

    /**
     * 获取我的已开通应用列表（合并应用商店信息 + API凭证状态）
     * 前端用于展示"已购应用"及其配置状态
     */
    @PostMapping("/my-apps")
    public Result<?> getMyApps() {
        try {
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) tenantId = 0L;

            // 获取所有订阅
            QueryWrapper<TenantSubscription> subWrapper = new QueryWrapper<>();
            subWrapper.eq("tenant_id", tenantId);
            subWrapper.orderByDesc("create_time");
            List<TenantSubscription> subscriptions = tenantSubscriptionService.list(subWrapper);

            // 获取所有 TenantApp
            com.baomidou.mybatisplus.extension.plugins.pagination.Page<TenantAppResponse> appsPage =
                tenantAppOrchestrator.listApps(tenantId, null, null, 1, 100);
            List<TenantAppResponse> apps = appsPage.getRecords();

            // 组装每个已订阅应用的信息
            List<Map<String, Object>> myApps = new java.util.ArrayList<>();
            java.util.Set<String> processedCodes = new java.util.HashSet<>();

            for (TenantSubscription sub : subscriptions) {
                if (processedCodes.contains(sub.getAppCode())) continue;
                processedCodes.add(sub.getAppCode());

                Map<String, Object> appInfo = new java.util.LinkedHashMap<>();
                appInfo.put("subscriptionId", sub.getId());
                appInfo.put("appCode", sub.getAppCode());
                appInfo.put("appName", sub.getAppName());
                appInfo.put("subscriptionType", sub.getSubscriptionType());
                appInfo.put("status", sub.getStatus());
                appInfo.put("startTime", sub.getStartTime());
                appInfo.put("endTime", sub.getEndTime());
                boolean isExpired = sub.getEndTime() != null && sub.getEndTime().isBefore(LocalDateTime.now());
                appInfo.put("isExpired", isExpired);

                // 匹配对应的 TenantApp
                TenantAppResponse matchedApp = apps.stream()
                    .filter(a -> sub.getAppCode().equals(a.getAppType()))
                    .findFirst().orElse(null);

                if (matchedApp != null) {
                    appInfo.put("tenantAppId", matchedApp.getId());
                    appInfo.put("appKey", matchedApp.getAppKey());
                    appInfo.put("callbackUrl", matchedApp.getCallbackUrl());
                    appInfo.put("externalApiUrl", matchedApp.getExternalApiUrl());
                    appInfo.put("dailyQuota", matchedApp.getDailyQuota());
                    appInfo.put("dailyUsed", matchedApp.getDailyUsed());
                    appInfo.put("totalCalls", matchedApp.getTotalCalls());
                    appInfo.put("appStatus", matchedApp.getStatus());
                    // 配置状态判断
                    boolean hasCallbackUrl = matchedApp.getCallbackUrl() != null && !matchedApp.getCallbackUrl().isEmpty();
                    boolean hasExternalUrl = matchedApp.getExternalApiUrl() != null && !matchedApp.getExternalApiUrl().isEmpty();
                    appInfo.put("configured", hasCallbackUrl || hasExternalUrl);
                    appInfo.put("hasCallbackUrl", hasCallbackUrl);
                    appInfo.put("hasExternalUrl", hasExternalUrl);
                } else {
                    appInfo.put("configured", false);
                    appInfo.put("hasCallbackUrl", false);
                    appInfo.put("hasExternalUrl", false);
                }

                // API端点列表
                appInfo.put("apiEndpoints", getApiEndpointsForModule(sub.getAppCode()));

                myApps.add(appInfo);
            }

            return Result.success(myApps);
        } catch (Exception e) {
            log.error("获取我的应用失败", e);
            return Result.fail("获取失败：" + e.getMessage());
        }
    }

    /**
     * 获取我的订阅
     */
    @PostMapping("/my-subscriptions")
    public Result<List<TenantSubscription>> getMySubscriptions() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) tenantId = 0L;
        QueryWrapper<TenantSubscription> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId);
        wrapper.orderByDesc("create_time");
        List<TenantSubscription> subscriptions = tenantSubscriptionService.list(wrapper);
        return Result.success(subscriptions);
    }

    /**
     * 检查租户对某应用的试用状态
     */
    @GetMapping("/trial-status/{appId}")
    public Result<Map<String, Object>> getTrialStatus(@PathVariable Long appId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) tenantId = 0L;

        // 查询该租户对该应用的试用记录
        QueryWrapper<TenantSubscription> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId);
        wrapper.eq("app_id", appId);
        wrapper.eq("subscription_type", "TRIAL");
        wrapper.orderByDesc("create_time");
        wrapper.last("LIMIT 1");

        TenantSubscription trial = tenantSubscriptionService.getOne(wrapper);

        Map<String, Object> result = new java.util.HashMap<>();
        if (trial == null) {
            result.put("hasTried", false);
            result.put("canTrial", true);
        } else {
            result.put("hasTried", true);
            result.put("canTrial", false);
            result.put("startTime", trial.getStartTime());
            result.put("endTime", trial.getEndTime());
            boolean isExpired = trial.getEndTime() != null && trial.getEndTime().isBefore(LocalDateTime.now());
            result.put("isExpired", isExpired);
            result.put("status", isExpired ? "EXPIRED" : "TRIAL");
        }

        return Result.success(result);
    }

    /**
     * 【管理员】手动激活订单（人工开通模式）
     * 收到款项后，管理员调用此接口完成开通，无需对接支付网关
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/admin/activate-order")
    public Result<?> adminActivateOrder(@RequestBody ActivateOrderRequest request) {
        try {
            // 1. 查询订单
            AppOrder order = appOrderService.getById(request.getOrderId());
            if (order == null) {
                return Result.fail("订单不存在");
            }
            if ("PAID".equals(order.getStatus()) || "ACTIVATED".equals(order.getStatus())) {
                return Result.fail("订单已激活，请勿重复操作");
            }

            // 2. 更新订单状态
            order.setStatus("PAID");
            order.setPaymentMethod("MANUAL");
            order.setPaymentTime(LocalDateTime.now());
            if (request.getRemark() != null) {
                order.setRemark(request.getRemark());
            }
            appOrderService.updateById(order);

            // 3. 查询应用信息
            AppStore app = appStoreService.getById(order.getAppId());
            if (app == null) {
                return Result.fail("关联应用不存在");
            }

            // 4. 计算订阅有效期
            LocalDateTime startTime = LocalDateTime.now();
            LocalDateTime endTime;
            switch (order.getSubscriptionType()) {
                case "MONTHLY":
                    endTime = startTime.plusMonths(1);
                    break;
                case "YEARLY":
                    endTime = startTime.plusYears(1);
                    break;
                case "PERPETUAL":
                    endTime = startTime.plusYears(99);
                    break;
                default:
                    endTime = startTime.plusMonths(1);
            }

            // 5. 创建订阅记录
            TenantSubscription subscription = new TenantSubscription();
            subscription.setSubscriptionNo(tenantSubscriptionService.generateSubscriptionNo());
            subscription.setTenantId(order.getTenantId());
            subscription.setTenantName(order.getTenantName());
            subscription.setAppId(app.getId());
            subscription.setAppCode(app.getAppCode());
            subscription.setAppName(app.getAppName());
            subscription.setSubscriptionType(order.getSubscriptionType());
            subscription.setPrice(order.getActualAmount());
            subscription.setUserCount(order.getUserCount());
            subscription.setStartTime(startTime);
            subscription.setEndTime(endTime);
            subscription.setStatus("ACTIVE");
            subscription.setAutoRenew(false);
            UserContext ctx = UserContext.get();
            subscription.setCreatedBy(ctx != null ? ctx.getUsername() : "admin");
            subscription.setOrderId(order.getId());
            subscription.setRemark("人工开通 - " + (request.getRemark() != null ? request.getRemark() : order.getOrderNo()));
            tenantSubscriptionService.save(subscription);

            // 6. 自动创建 API 凭证（TenantApp）
            TenantAppResponse appCredentials = null;
            try {
                TenantAppRequest appRequest = new TenantAppRequest();
                appRequest.setAppName(app.getAppName());
                appRequest.setAppType(app.getAppCode());
                appRequest.setDailyQuota(10000);
                appRequest.setRemark("人工开通 - 订单: " + order.getOrderNo());
                appRequest.setExpireTime(endTime.toString());
                appCredentials = tenantAppOrchestrator.createApp(order.getTenantId(), appRequest);
                log.info("[人工开通] 自动创建API凭证成功: appKey={}", appCredentials.getAppKey());
            } catch (Exception ex) {
                log.warn("[人工开通] 自动创建API凭证失败（不影响订阅）: {}", ex.getMessage());
            }

            log.info("[人工开通] 订单激活成功: {} - 租户{} - 应用{} - 到期{}",
                order.getOrderNo(), order.getTenantId(), app.getAppName(), endTime);

            java.util.Map<String, Object> responseData = new java.util.HashMap<>();
            responseData.put("subscription", subscription);
            responseData.put("orderNo", order.getOrderNo());
            responseData.put("activatedAt", startTime);
            responseData.put("expireAt", endTime);
            if (appCredentials != null) {
                responseData.put("apiCredentials", java.util.Map.of(
                    "appKey", appCredentials.getAppKey(),
                    "appSecret", appCredentials.getAppSecret()
                ));
            }
            return Result.success(responseData);

        } catch (Exception e) {
            log.error("[人工开通] 激活订单失败", e);
            return Result.fail("激活失败：" + e.getMessage());
        }
    }

    /**
     * 【管理员】查看所有待处理订单（用于跟进人工开通）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/admin/order-list")
    public Result<List<AppOrder>> adminOrderList(@RequestBody(required = false) Map<String, Object> params) {
        QueryWrapper<AppOrder> wrapper = new QueryWrapper<>();
        if (params != null && params.containsKey("status")) {
            wrapper.eq("status", params.get("status"));
        }
        wrapper.orderByDesc("create_time");
        return Result.success(appOrderService.list(wrapper));
    }

    /**
     * 获取某个模块包含的所有API端点信息
     */
    private List<Map<String, String>> getApiEndpointsForModule(String appCode) {
        List<Map<String, String>> endpoints = new java.util.ArrayList<>();
        switch (appCode) {
            case "ORDER_SYNC":
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/order/create", "desc", "创建生产订单"));
                endpoints.add(Map.of("method", "GET", "path", "/openapi/v1/order/status/{orderNo}", "desc", "查询订单状态"));
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/order/list", "desc", "订单列表查询"));
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/order/upload", "desc", "批量上传订单"));
                break;
            case "QUALITY_FEEDBACK":
                endpoints.add(Map.of("method", "GET", "path", "/openapi/v1/quality/report/{orderNo}", "desc", "获取质检报告"));
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/quality/list", "desc", "质检记录列表"));
                endpoints.add(Map.of("method", "PUSH", "path", "Webhook回调", "desc", "自动推送质检结果到您的系统"));
                break;
            case "LOGISTICS_SYNC":
                endpoints.add(Map.of("method", "GET", "path", "/openapi/v1/logistics/status/{orderNo}", "desc", "查询物流状态"));
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/logistics/list", "desc", "物流记录列表"));
                endpoints.add(Map.of("method", "PUSH", "path", "Webhook回调", "desc", "出库时自动推送物流信息"));
                break;
            case "PAYMENT_SYNC":
                endpoints.add(Map.of("method", "GET", "path", "/openapi/v1/payment/pending", "desc", "待付款清单"));
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/payment/confirm", "desc", "确认付款"));
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/payment/list", "desc", "付款记录列表"));
                break;
            case "MATERIAL_SUPPLY":
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/material/purchase-order", "desc", "推送采购订单"));
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/material/purchase/upload", "desc", "批量上传采购记录"));
                endpoints.add(Map.of("method", "POST", "path", "/openapi/v1/material/inventory/query", "desc", "查询供应商库存"));
                endpoints.add(Map.of("method", "PUSH", "path", "/openapi/v1/webhook/material/order-confirm", "desc", "供应商对采购单确认回调"));
                endpoints.add(Map.of("method", "PUSH", "path", "/openapi/v1/webhook/material/price-update", "desc", "供应商价格更新回调"));
                endpoints.add(Map.of("method", "PUSH", "path", "/openapi/v1/webhook/material/shipping-update", "desc", "供应商发货物流回调"));
                break;
            default:
                break;
        }
        return endpoints;
    }

    /**
     * 计算价格
     */
    private BigDecimal calculatePrice(AppStore app, String subscriptionType) {
        switch (subscriptionType) {
            case "TRIAL":
                return BigDecimal.ZERO;
            case "MONTHLY":
                return app.getPriceMonthly() != null ? app.getPriceMonthly() : BigDecimal.ZERO;
            case "YEARLY":
                return app.getPriceYearly() != null ? app.getPriceYearly() : BigDecimal.ZERO;
            case "PERPETUAL":
                return app.getPriceOnce() != null ? app.getPriceOnce() : BigDecimal.ZERO;
            default:
                return BigDecimal.ZERO;
        }
    }

    /**
     * 创建订单请求
     */
    @Data
    public static class CreateOrderRequest {
        private Long appId;
        private String appCode;
        private String appName;
        private String subscriptionType;
        private Integer userCount;
        private String contactName;
        private String contactPhone;
        private String contactEmail;
        private String companyName;
        private Boolean invoiceRequired;
        private String invoiceTitle;
        private String invoiceTaxNo;
    }

    /**
     * 管理员激活订单请求
     */
    @Data
    public static class ActivateOrderRequest {
        private Long orderId;
        private String remark; // 备注，如"已收款/转账确认"
    }
}
