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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
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

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

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
     * 【管理员】查看所有租户的应用购买订单
     * ⚠️ 使用 JdbcTemplate 原生 SQL，彻底绕开 MyBatis-Plus 租户拦截器
     * 超管必须能看到全部租户的订单，不受任何租户过滤影响
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/admin/order-list")
    public Result<List<AppOrder>> adminOrderList(@RequestBody(required = false) Map<String, Object> params) {
        try {
            StringBuilder sql = new StringBuilder(
                "SELECT id, order_no, tenant_id, tenant_name, app_id, app_code, app_name, " +
                "order_type, subscription_type, user_count, unit_price, total_amount, " +
                "discount_amount, actual_amount, status, payment_method, payment_time, " +
                "contact_name, contact_phone, contact_email, company_name, " +
                "invoice_required, invoice_title, invoice_tax_no, remark, created_by, " +
                "create_time, update_time " +
                "FROM t_app_order WHERE delete_flag = 0"
            );
            List<Object> args = new ArrayList<>();

            String statusFilter = (params != null && params.containsKey("status") && params.get("status") != null)
                    ? params.get("status").toString().trim() : "";
            if (!statusFilter.isEmpty()) {
                sql.append(" AND status = ?");
                args.add(statusFilter);
            }
            sql.append(" ORDER BY create_time DESC");

            List<AppOrder> orders = jdbcTemplate.query(
                sql.toString(), args.toArray(),
                new org.springframework.jdbc.core.BeanPropertyRowMapper<>(AppOrder.class)
            );
            log.info("[AdminOrderList] 超管查询全量订单：共 {} 条，状态过滤={}",
                    orders.size(), statusFilter.isEmpty() ? "全部" : statusFilter);
            return Result.success(orders);
        } catch (Exception e) {
            log.error("[AdminOrderList] 查询失败", e);
            return Result.fail("查询订单失败：" + e.getMessage());
        }
    }

    /**
     * 【管理员】获取通知配置（Server酱Key脱敏返回）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/admin/notify-config")
    public Result<Map<String, Object>> getNotifyConfig() {
        Map<String, Object> config = new java.util.HashMap<>();
        String key = "";
        if (jdbcTemplate != null) {
            try {
                java.util.List<String> rows = jdbcTemplate.queryForList(
                    "SELECT param_value FROM t_param_config WHERE param_key = 'notify.serverchan.key' LIMIT 1",
                    String.class);
                key = rows.isEmpty() ? "" : (rows.get(0) == null ? "" : rows.get(0));
            } catch (Exception e) {
                log.warn("读取通知配置失败: {}", e.getMessage());
            }
        }
        // 脱敏：只显示前6位和后4位
        String masked = key.isBlank() ? "" :
            (key.length() > 10 ? key.substring(0, 6) + "****" + key.substring(key.length() - 4) : "已配置");
        config.put("configured", !key.isBlank());
        config.put("maskedKey", masked);
        return Result.success(config);
    }

    /**
     * 【管理员】保存Server酱通知Key（保存到数据库，热更新无需重启）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/admin/notify-config")
    public Result<Void> saveNotifyConfig(@RequestBody Map<String, String> body) {
        String key = body.getOrDefault("serverChanKey", "").trim();
        if (jdbcTemplate == null) {
            return Result.fail("数据库连接不可用");
        }
        try {
            jdbcTemplate.update(
                "INSERT INTO t_param_config (param_key, param_value, param_desc) VALUES (?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE param_value = VALUES(param_value)",
                "notify.serverchan.key", key,
                "Server酱微信推送Key（在 sct.ftqq.com 获取）");
            log.info("[通知配置] 超管更新Server酱Key: configured={}", !key.isBlank());
            return Result.success(null);
        } catch (Exception e) {
            log.error("保存通知配置失败", e);
            return Result.fail("保存失败：" + e.getMessage());
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
