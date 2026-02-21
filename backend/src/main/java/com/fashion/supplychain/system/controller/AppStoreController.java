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
    @PreAuthorize("hasAuthority('MENU_APP_STORE_VIEW')")
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
    @PreAuthorize("hasAuthority('MENU_APP_STORE_VIEW')")
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
    @PreAuthorize("hasAuthority('MENU_APP_STORE_BUY')")
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
     */
    @PreAuthorize("hasAuthority('MENU_APP_STORE_VIEW')")
    @PostMapping("/start-trial")
    public Result<?> startTrial(@RequestBody Map<String, Object> params) {
        try {
            Long appId = Long.valueOf(params.get("appId").toString());
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) tenantId = 0L;

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

            // 6. 自动创建 TenantApp（API对接凭证），使租户可以立即使用API
            TenantAppResponse appCredentials = null;
            try {
                TenantAppRequest appRequest = new TenantAppRequest();
                appRequest.setAppName(app.getAppName() + "(试用)");
                appRequest.setAppType(app.getAppCode()); // AppStore.appCode == TenantApp.appType
                appRequest.setDailyQuota(100); // 试用期每日100次调用
                appRequest.setRemark("试用自动创建 - 订阅号: " + subscription.getSubscriptionNo());
                String expireTime = subscription.getEndTime().toString();
                appRequest.setExpireTime(expireTime);
                appCredentials = tenantAppOrchestrator.createApp(tenantId, appRequest);
                log.info("试用自动创建API凭证: appKey={}", appCredentials.getAppKey());
            } catch (Exception ex) {
                log.warn("试用自动创建API凭证失败（不影响试用）: {}", ex.getMessage());
            }

            log.info("应用试用开通成功：{} - 租户 {} - 到期 {}",
                app.getAppName(), tenantId, subscription.getEndTime());

            // 返回订阅信息，附带API凭证
            Map<String, Object> responseData = new java.util.HashMap<>();
            responseData.put("subscription", subscription);
            if (appCredentials != null) {
                responseData.put("apiCredentials", Map.of(
                    "appKey", appCredentials.getAppKey(),
                    "appSecret", appCredentials.getAppSecret(),
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
     * 获取我的订阅
     */
    @PreAuthorize("hasAuthority('MENU_APP_SUBSCRIPTION_VIEW')")
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
    @PreAuthorize("hasAuthority('MENU_APP_STORE_VIEW')")
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
     * 计算价格
     */
    private BigDecimal calculatePrice(AppStore app, String subscriptionType) {
        switch (subscriptionType) {
            case "TRIAL":
                return BigDecimal.ZERO;
            case "MONTHLY":
                return app.getPriceMonthly();
            case "YEARLY":
                return app.getPriceYearly();
            case "PERPETUAL":
                return app.getPriceOnce();
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
