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
import com.fashion.supplychain.system.orchestration.AppStoreOrchestrator;
import com.fashion.supplychain.system.service.AppOrderService;
import com.fashion.supplychain.system.service.AppStoreService;
import com.fashion.supplychain.system.service.TenantSubscriptionService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 应用商店Controller
 * 路由端点层，复杂业务逻辑委托给 AppStoreOrchestrator 编排
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

    @Autowired
    private AppStoreOrchestrator appStoreOrchestrator;

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
            AppStore app = appStoreService.getById(request.getAppId());
            if (app == null) {
                return Result.fail("应用不存在");
            }
            Long tenantId = UserContext.tenantId();
            AppOrder order = appStoreOrchestrator.createOrder(app, tenantId,
                    request.getSubscriptionType(), request.getUserCount(),
                    request.getContactName(), request.getContactPhone(),
                    request.getContactEmail(), request.getCompanyName(),
                    request.getInvoiceRequired(), request.getInvoiceTitle(), request.getInvoiceTaxNo());
            return Result.success(order);
        } catch (Exception e) {
            log.error("创建订单失败", e);
            return Result.fail("创建订单失败：" + e.getMessage());
        }
    }

    /**
     * 开通免费试用（7天）
     * 委托给 AppStoreOrchestrator 编排，包含事务保护
     */
    @PostMapping("/start-trial")
    public Result<?> startTrial(@RequestBody Map<String, Object> params) {
        try {
            Long appId = Long.valueOf(params.get("appId").toString());
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) tenantId = 0L;

            String callbackUrl = params.get("callbackUrl") != null ? params.get("callbackUrl").toString().trim() : null;
            String externalApiUrl = params.get("externalApiUrl") != null ? params.get("externalApiUrl").toString().trim() : null;

            Map<String, Object> result = appStoreOrchestrator.startTrial(appId, tenantId, callbackUrl, externalApiUrl);
            return Result.success(result);
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
     * 获取我的已开通应用列表（委托给 Orchestrator）
     */
    @PostMapping("/my-apps")
    public Result<?> getMyApps() {
        try {
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) tenantId = 0L;
            List<Map<String, Object>> myApps = appStoreOrchestrator.getMyApps(tenantId);
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
     * 【管理员】手动激活订单（委托给 Orchestrator，包含事务保护）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/admin/activate-order")
    public Result<?> adminActivateOrder(@RequestBody ActivateOrderRequest request) {
        try {
            Map<String, Object> result = appStoreOrchestrator.adminActivateOrder(
                    request.getOrderId(), request.getRemark());
            return Result.success(result);
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
