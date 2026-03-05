package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.openapi.dto.TenantAppRequest;
import com.fashion.supplychain.integration.openapi.dto.TenantAppResponse;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import com.fashion.supplychain.system.entity.AppOrder;
import com.fashion.supplychain.system.entity.AppStore;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.AppOrderService;
import com.fashion.supplychain.system.service.AppStoreService;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.TenantSubscriptionService;
import com.fashion.supplychain.system.service.UserService;
import com.fashion.supplychain.system.entity.TenantSubscription;
import com.fashion.supplychain.websocket.service.WebSocketService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 应用商店编排器
 * 负责应用商店的核心业务逻辑编排：试用开通、订单激活、我的应用查询等
 * 所有涉及多表写操作的方法都在此层管理事务
 */
@Slf4j
@Service
public class AppStoreOrchestrator {

    @Autowired
    private AppStoreService appStoreService;

    @Autowired
    private AppOrderService appOrderService;

    @Autowired
    private TenantSubscriptionService tenantSubscriptionService;

    @Autowired
    private TenantAppOrchestrator tenantAppOrchestrator;

    @Autowired
    private TenantService tenantService;

    @Autowired(required = false)
    private WebSocketService webSocketService;

    @Autowired
    private UserService userService;

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;


    /** Server酱 SendKey，优先从数据库读取（t_param_config），其次用环境变量 */
    @Value("${notify.serverchan.key:}")
    private String serverChanKeyEnv;

    /**
     * 获取 Server酱 Key（优先数据库，支持后台热更新，无需重启）
     */
    private String getServerChanKey() {
        if (jdbcTemplate != null) {
            try {
                List<String> rows = jdbcTemplate.queryForList(
                    "SELECT param_value FROM t_param_config WHERE param_key = 'notify.serverchan.key' LIMIT 1",
                    String.class);
                if (!rows.isEmpty() && rows.get(0) != null && !rows.get(0).isBlank()) {
                    return rows.get(0).trim();
                }
            } catch (Exception e) {
                log.debug("[Server酱] 从数据库读取Key失败，降级使用环境变量: {}", e.getMessage());
            }
        }
        return serverChanKeyEnv;
    }

    /**
     * 发送微信通知（通过 Server酱，免费，直接推送到管理员个人微信"服务通知"）
     * 配置方式一：后台「应用订单」→ 右上角「通知设置」填入 SendKey（推荐，热更新）
     * 配置方式二：设置环境变量 NOTIFY_SERVERCHAN_KEY=你的SendKey
     * 获取 SendKey：微信扫码登录 https://sct.ftqq.com/
     */
    private void sendWechatNotify(String title, String content) {
        String key = getServerChanKey();
        if (key == null || key.isBlank()) {
            return; // 未配置，静默跳过
        }
        try {
            String apiUrl = "https://sctapi.ftqq.com/" + key + ".send";
            String body = "title=" + URLEncoder.encode(title, StandardCharsets.UTF_8)
                    + "&desp=" + URLEncoder.encode(content, StandardCharsets.UTF_8);
            HttpURLConnection conn = (HttpURLConnection) new URL(apiUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            log.info("[Server酱通知] 发送结果: HTTP {}, title={}", code, title);
            conn.disconnect();
        } catch (Exception e) {
            log.warn("[Server酱通知] 发送失败（不影响主流程）: {}", e.getMessage());
        }
    }

    /**
     * 获取当前租户名称（优先从 t_tenant 查，否则用 username）
     */
    private String resolveTenantName(Long tenantId) {
        if (tenantId != null && tenantId > 0) {
            try {
                Tenant tenant = tenantService.getById(tenantId);
                if (tenant != null && tenant.getTenantName() != null && !tenant.getTenantName().isEmpty()) {
                    return tenant.getTenantName();
                }
            } catch (Exception e) {
                log.warn("查询租户名称失败, tenantId={}", tenantId);
            }
        }
        UserContext ctx = UserContext.get();
        return ctx != null && ctx.getUsername() != null ? ctx.getUsername() : "未知租户";
    }

    /**
     * 创建订单（购买意向）
     */
    public AppOrder createOrder(AppStore app, Long tenantId, String subscriptionType,
                                int userCount, String contactName, String contactPhone,
                                String contactEmail, String companyName,
                                Boolean invoiceRequired, String invoiceTitle, String invoiceTaxNo) {
        BigDecimal unitPrice = calculatePrice(app, subscriptionType);
        BigDecimal totalAmount = unitPrice.multiply(BigDecimal.valueOf(userCount));
        BigDecimal discountAmount = BigDecimal.ZERO;
        BigDecimal actualAmount = totalAmount.subtract(discountAmount);

        AppOrder order = new AppOrder();
        order.setOrderNo(appOrderService.generateOrderNo());
        order.setTenantId(tenantId != null ? tenantId : 0L);
        order.setTenantName(resolveTenantName(tenantId));
        order.setAppId(app.getId());
        order.setAppCode(app.getAppCode());
        order.setAppName(app.getAppName());
        order.setOrderType("NEW");
        order.setSubscriptionType(subscriptionType);
        order.setUserCount(userCount);
        order.setUnitPrice(unitPrice);
        order.setTotalAmount(totalAmount);
        order.setDiscountAmount(discountAmount);
        order.setActualAmount(actualAmount);
        order.setStatus("PENDING");
        order.setContactName(contactName);
        order.setContactPhone(contactPhone);
        order.setContactEmail(contactEmail);
        order.setCompanyName(companyName);
        order.setInvoiceRequired(invoiceRequired);
        order.setInvoiceTitle(invoiceTitle);
        order.setInvoiceTaxNo(invoiceTaxNo);
        UserContext ctx = UserContext.get();
        order.setCreatedBy(ctx != null ? ctx.getUsername() : "system");

        appOrderService.save(order);
        log.info("创建应用订单成功：{}", order.getOrderNo());

        // 系统内 WebSocket 通知超管（非阻塞，失败不影响主流程）
        try {
            if (webSocketService != null) {
                LambdaQueryWrapper<User> adminQuery = new LambdaQueryWrapper<>();
                adminQuery.eq(User::getIsSuperAdmin, true)
                          .eq(User::getStatus, "active")
                          .isNull(User::getTenantId);
                List<User> superAdmins = userService.list(adminQuery);
                for (User sa : superAdmins) {
                    webSocketService.notifyAppOrderPending(
                        String.valueOf(sa.getId()), order.getTenantName(),
                        app.getAppName(), order.getOrderNo());
                }
                log.info("[应用订单通知] 已推送给 {} 位超管", superAdmins.size());
            }
        } catch (Exception e) {
            log.warn("[应用订单通知] WebSocket推送失败（不影响主流程）: {}", e.getMessage());
        }

        // 微信通知（Server酱，非阻塞，失败不影响主流程）
        try {
            String notifyContent = "**应用**：" + app.getAppName() + "  \n"
                    + "**套餐**：" + subscriptionType + "  \n"
                    + "**金额**：¥" + actualAmount + "  \n"
                    + "**联系人**：" + contactName + " " + contactPhone + "  \n"
                    + "**公司**：" + (companyName != null ? companyName : "-") + "  \n"
                    + "**租户**：" + order.getTenantName() + "  \n"
                    + "**订单号**：" + order.getOrderNo() + "  \n"
                    + "\n> 请登录后台 → 应用商店 → 人工激活订单";
            sendWechatNotify("🛒 新购买订单：" + app.getAppName(), notifyContent);
        } catch (Exception e) {
            log.warn("订单通知发送异常（不影响主流程）", e);
        }

        return order;
    }

    /**
     * 开通免费试用（核心方法，包含事务保护）
     * 1. 创建试用订阅记录
     * 2. 自动创建 TenantApp（API凭证）
     * 两步操作在同一事务中，任何一步失败都会回滚
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> startTrial(Long appId, Long tenantId, String callbackUrl, String externalApiUrl) {
        // 1. 查询应用信息
        AppStore app = appStoreService.getById(appId);
        if (app == null) {
            throw new RuntimeException("应用不存在");
        }

        // 2. 检查是否支持试用
        if (app.getTrialDays() == null || app.getTrialDays() <= 0) {
            throw new RuntimeException("该应用不支持免费试用");
        }

        // 3. 检查是否已经试用过（每个租户每个应用只能试用一次）
        QueryWrapper<TenantSubscription> checkWrapper = new QueryWrapper<>();
        checkWrapper.eq("tenant_id", tenantId);
        checkWrapper.eq("app_id", appId);
        checkWrapper.eq("subscription_type", "TRIAL");
        long trialCount = tenantSubscriptionService.count(checkWrapper);
        if (trialCount > 0) {
            throw new RuntimeException("您已试用过该应用，每个应用仅可试用一次");
        }

        // 4. 检查是否已有有效订阅
        QueryWrapper<TenantSubscription> activeWrapper = new QueryWrapper<>();
        activeWrapper.eq("tenant_id", tenantId);
        activeWrapper.eq("app_id", appId);
        activeWrapper.in("status", "ACTIVE", "TRIAL");
        activeWrapper.gt("end_time", LocalDateTime.now());
        long activeCount = tenantSubscriptionService.count(activeWrapper);
        if (activeCount > 0) {
            throw new RuntimeException("您已有该应用的有效订阅，无需再试用");
        }

        // 5. 创建试用订阅
        TenantSubscription subscription = new TenantSubscription();
        subscription.setSubscriptionNo(tenantSubscriptionService.generateSubscriptionNo());
        subscription.setTenantId(tenantId);
        subscription.setTenantName(resolveTenantName(tenantId));
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
        UserContext ctx = UserContext.get();
        subscription.setCreatedBy(ctx != null ? ctx.getUsername() : "system");
        subscription.setRemark("免费试用" + app.getTrialDays() + "天");

        tenantSubscriptionService.save(subscription);

        // 6. 创建 AppOrder（status=TRIAL）让超管在「应用订单」看板中可见
        //    同时触发 WebSocket 通知 + Server酱微信通知（与付费订单逻辑对称）
        AppOrder trialOrder = new AppOrder();
        trialOrder.setOrderNo(appOrderService.generateOrderNo());
        trialOrder.setTenantId(tenantId);
        trialOrder.setTenantName(resolveTenantName(tenantId));
        trialOrder.setAppId(app.getId());
        trialOrder.setAppCode(app.getAppCode());
        trialOrder.setAppName(app.getAppName());
        trialOrder.setOrderType("TRIAL");
        trialOrder.setSubscriptionType("TRIAL");
        trialOrder.setUserCount(1);
        trialOrder.setUnitPrice(BigDecimal.ZERO);
        trialOrder.setTotalAmount(BigDecimal.ZERO);
        trialOrder.setDiscountAmount(BigDecimal.ZERO);
        trialOrder.setActualAmount(BigDecimal.ZERO);
        trialOrder.setStatus("TRIAL");   // TRIAL 状态，超管看板只读，无需激活
        trialOrder.setInvoiceRequired(false);
        UserContext ctxForOrder = UserContext.get();
        trialOrder.setCreatedBy(ctxForOrder != null ? ctxForOrder.getUsername() : "system");
        trialOrder.setRemark("免费试用" + app.getTrialDays() + "天 - 自动开通");
        appOrderService.save(trialOrder);
        log.info("[试用订单] 已创建 AppOrder(TRIAL): orderNo={}", trialOrder.getOrderNo());

        // 超管 WebSocket 推送（非阻塞，失败不影响主流程）
        try {
            if (webSocketService != null) {
                LambdaQueryWrapper<User> adminQuery = new LambdaQueryWrapper<>();
                adminQuery.eq(User::getIsSuperAdmin, true)
                          .eq(User::getStatus, "active")
                          .isNull(User::getTenantId);
                List<User> superAdmins = userService.list(adminQuery);
                for (User sa : superAdmins) {
                    webSocketService.notifyAppOrderPending(
                        String.valueOf(sa.getId()), trialOrder.getTenantName(),
                        app.getAppName() + "（免费试用）", trialOrder.getOrderNo());
                }
                log.info("[试用通知] 已推送给 {} 位超管", superAdmins.size());
            }
        } catch (Exception e) {
            log.warn("[试用通知] WebSocket推送失败（不影响主流程）: {}", e.getMessage());
        }

        // Server酱微信通知（非阻塞）
        try {
            String tenantName = resolveTenantName(tenantId);
            String notifyContent = "**应用**：" + app.getAppName() + "  \n"
                    + "**类型**：免费试用（" + app.getTrialDays() + "天）  \n"
                    + "**租户**：" + tenantName + "  \n"
                    + "**到期**：" + subscription.getEndTime().toString().replace("T", " ").substring(0, 19) + "  \n"
                    + "**订单号**：" + trialOrder.getOrderNo() + "  \n"
                    + "\n> 试用已自动激活，可在后台「应用订单」查看";
            sendWechatNotify("🎁 新试用开通：" + app.getAppName(), notifyContent);
        } catch (Exception e) {
            log.warn("[试用通知] Server酱推送失败（不影响主流程）: {}", e.getMessage());
        }

        // 7. 自动创建 TenantApp（API对接凭证）
        //    CRM_MODULE / FINANCE_TAX / PROCUREMENT 为纯 UI 功能模块，开通后直接解锁页面，无需 API 凭证
        java.util.Set<String> UI_MODULE_TYPES = java.util.Set.of("CRM_MODULE", "FINANCE_TAX", "PROCUREMENT");
        boolean needsApiCredential = !UI_MODULE_TYPES.contains(app.getAppCode());

        TenantAppResponse appCredentials = null;
        if (needsApiCredential) {
            try {
                TenantAppRequest appRequest = new TenantAppRequest();
                appRequest.setAppName(app.getAppName() + "(试用)");
                appRequest.setAppType(app.getAppCode());
                appRequest.setDailyQuota(100);
                appRequest.setRemark("试用自动创建 - 订阅号: " + subscription.getSubscriptionNo());
                appRequest.setExpireTime(subscription.getEndTime().toString());
                if (callbackUrl != null && !callbackUrl.isEmpty()) {
                    appRequest.setCallbackUrl(callbackUrl);
                }
                if (externalApiUrl != null && !externalApiUrl.isEmpty()) {
                    appRequest.setExternalApiUrl(externalApiUrl);
                }
                appCredentials = tenantAppOrchestrator.createApp(tenantId, appRequest);
                log.info("[试用] 自动创建API凭证: appKey={}", appCredentials.getAppKey());
            } catch (Exception ex) {
                // 凭证创建失败时回滚整个事务，不允许出现有订阅但无凭证的情况
                throw new RuntimeException("开通试用失败：API凭证创建失败 - " + ex.getMessage(), ex);
            }
        } else {
            log.info("[试用] UI功能模块({})无需API凭证，跳过创建", app.getAppCode());
        }

        log.info("应用试用开通成功：{} - 租户 {} - 到期 {}",
                app.getAppName(), tenantId, subscription.getEndTime());

        // 8. 构建API端点信息
        List<Map<String, String>> apiEndpoints = getApiEndpointsForModule(app.getAppCode());

        // 返回完整数据
        Map<String, Object> responseData = new HashMap<>();
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
        return responseData;
    }

    /**
     * 管理员手动激活订单（包含事务保护）
     * 1. 更新订单状态为已支付
     * 2. 创建订阅记录
     * 3. 自动创建 API 凭证
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> adminActivateOrder(Long orderId, String remark) {
        // 1. 查询订单（使用 JdbcTemplate 原生 SQL，彻底绕开 MyBatis-Plus 租户拦截器，
        //    与 adminOrderList / UPDATE 操作保持一致——超管操作不依赖运行时 UserContext）
        if (orderId == null) {
            throw new RuntimeException("订单不存在（orderId 为空）");
        }
        List<AppOrder> orderResults = jdbcTemplate.query(
            "SELECT * FROM t_app_order WHERE id = ? AND delete_flag = 0",
            new org.springframework.jdbc.core.BeanPropertyRowMapper<>(AppOrder.class), orderId);
        AppOrder order = orderResults.isEmpty() ? null : orderResults.get(0);
        if (order == null) {
            throw new RuntimeException("订单不存在（id=" + orderId + "）");
        }
        if ("PAID".equals(order.getStatus()) || "ACTIVATED".equals(order.getStatus())) {
            throw new RuntimeException("订单已激活，请勿重复操作");
        }

        // 2. 更新订单状态（使用 JdbcTemplate 原生 SQL，永久绕开 MyBatis-Plus 租户拦截器，
        //    与 adminOrderList 保持一致——超管操作不依赖运行时 UserContext）
        LocalDateTime now = LocalDateTime.now();
        int updated;
        if (remark != null) {
            updated = jdbcTemplate.update(
                "UPDATE t_app_order SET status='PAID', payment_method='MANUAL', payment_time=?, remark=?, update_time=? WHERE id=? AND delete_flag=0",
                now, remark, now, orderId);
        } else {
            updated = jdbcTemplate.update(
                "UPDATE t_app_order SET status='PAID', payment_method='MANUAL', payment_time=?, update_time=? WHERE id=? AND delete_flag=0",
                now, now, orderId);
        }
        if (updated == 0) {
            throw new RuntimeException("订单状态更新失败，请确认订单存在且未被删除（id=" + orderId + "）");
        }
        // 同步内存对象，后续逻辑通过 order 取值
        order.setStatus("PAID");
        order.setPaymentMethod("MANUAL");
        order.setPaymentTime(now);

        // 3. 查询应用信息
        AppStore app = appStoreService.getById(order.getAppId());
        if (app == null) {
            throw new RuntimeException("关联应用不存在");
        }

        // 4. 计算订阅有效期
        LocalDateTime startTime = LocalDateTime.now();
        LocalDateTime endTime;
        switch (order.getSubscriptionType()) {
            case "MONTHLY":
                endTime = startTime.plusMonths(1); break;
            case "YEARLY":
                endTime = startTime.plusYears(1); break;
            case "PERPETUAL":
                endTime = startTime.plusYears(99); break;
            default:
                endTime = startTime.plusMonths(1);
        }

        // 5. 创建订阅记录
        TenantSubscription subscription = new TenantSubscription();
        subscription.setSubscriptionNo(tenantSubscriptionService.generateSubscriptionNo());
        subscription.setTenantId(order.getTenantId());
        subscription.setTenantName(resolveTenantName(order.getTenantId()));
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
        subscription.setRemark("人工开通 - " + (remark != null ? remark : order.getOrderNo()));
        tenantSubscriptionService.save(subscription);

        // 6. 自动创建 API 凭证（仅限需要外部对接的应用类型）
        //    CRM_MODULE / FINANCE_TAX / PROCUREMENT 为纯 UI 功能模块，开通后直接解锁页面，无需 API 凭证
        java.util.Set<String> UI_MODULE_TYPES = java.util.Set.of("CRM_MODULE", "FINANCE_TAX", "PROCUREMENT");
        boolean needsApiCredential = !UI_MODULE_TYPES.contains(app.getAppCode());

        Map<String, Object> apiCredentialsResult = new java.util.LinkedHashMap<>();
        if (needsApiCredential) {
            try {
                TenantAppRequest appRequest = new TenantAppRequest();
                appRequest.setAppName(app.getAppName());
                appRequest.setAppType(app.getAppCode());
                appRequest.setDailyQuota(10000);
                appRequest.setRemark("人工开通 - 订单: " + order.getOrderNo());
                appRequest.setExpireTime(endTime.toString());
                TenantAppResponse appCredentials = tenantAppOrchestrator.createApp(order.getTenantId(), appRequest);
                log.info("[人工开通] 自动创建API凭证成功: appKey={}", appCredentials.getAppKey());
                apiCredentialsResult.put("appKey", appCredentials.getAppKey());
                apiCredentialsResult.put("appSecret", appCredentials.getAppSecret());
            } catch (Exception ex) {
                throw new RuntimeException("激活失败：API凭证创建失败 - " + ex.getMessage(), ex);
            }
        } else {
            log.info("[人工开通] UI功能模块({})无需API凭证，跳过创建", app.getAppCode());
        }

        log.info("[人工开通] 订单激活成功: {} - 租户{} - 应用{} - 到期{}",
                order.getOrderNo(), order.getTenantId(), app.getAppName(), endTime);

        java.time.format.DateTimeFormatter dtf = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
        Map<String, Object> responseData = new HashMap<>();
        responseData.put("subscriptionNo", subscription.getSubscriptionNo());
        responseData.put("orderNo", order.getOrderNo() != null ? order.getOrderNo() : "");
        responseData.put("activatedAt", startTime != null ? startTime.format(dtf) : "");
        responseData.put("expireAt", endTime != null ? endTime.format(dtf) : "");
        if (!apiCredentialsResult.isEmpty()) {
            responseData.put("apiCredentials", apiCredentialsResult);
        }
        return responseData;
    }

    /**
     * 获取"我的已开通应用"列表
     * 修复了去重逻辑：优先保留有效订阅（ACTIVE/未过期的TRIAL），而非简单按时间取最新
     * 超级管理员：直接返回所有 t_app_store 应用，全部视为永久激活
     */
    public List<Map<String, Object>> getMyApps(Long tenantId) {
        // 超管特权：拥有所有应用，永不过期
        if (UserContext.isSuperAdmin()) {
            List<AppStore> allApps = appStoreService.list();
            List<Map<String, Object>> result = new ArrayList<>();
            for (AppStore app : allApps) {
                Map<String, Object> appInfo = new LinkedHashMap<>();
                appInfo.put("appCode", app.getAppCode());
                appInfo.put("appName", app.getAppName());
                appInfo.put("subscriptionType", "PERMANENT");
                appInfo.put("status", "ACTIVE");
                appInfo.put("isExpired", false);
                appInfo.put("configured", true);
                result.add(appInfo);
            }
            return result;
        }

        // 获取所有订阅
        QueryWrapper<TenantSubscription> subWrapper = new QueryWrapper<>();
        subWrapper.eq("tenant_id", tenantId);
        subWrapper.orderByDesc("create_time");
        List<TenantSubscription> subscriptions = tenantSubscriptionService.list(subWrapper);

        // 获取所有 TenantApp
        Page<TenantAppResponse> appsPage = tenantAppOrchestrator.listApps(tenantId, null, null, 1, 100);
        List<TenantAppResponse> apps = appsPage.getRecords();

        // 按 appCode 分组，优先选择有效订阅
        Map<String, TenantSubscription> bestSubscriptions = new LinkedHashMap<>();
        for (TenantSubscription sub : subscriptions) {
            String code = sub.getAppCode();
            if (!bestSubscriptions.containsKey(code)) {
                // 第一次见到此 appCode，直接放入
                bestSubscriptions.put(code, sub);
            } else {
                // 已有记录 - 判断是否应该替换（有效订阅优先级更高）
                TenantSubscription existing = bestSubscriptions.get(code);
                boolean existingActive = isSubscriptionActive(existing);
                boolean currentActive = isSubscriptionActive(sub);

                if (!existingActive && currentActive) {
                    // 当前有效，已有的无效 -> 替换
                    bestSubscriptions.put(code, sub);
                }
                // 其他情况保持已有的（保持按 create_time DESC 的首个有效或首个记录）
            }
        }

        // 组装每个已订阅应用的信息
        List<Map<String, Object>> myApps = new ArrayList<>();

        for (TenantSubscription sub : bestSubscriptions.values()) {
            Map<String, Object> appInfo = new LinkedHashMap<>();
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

            appInfo.put("apiEndpoints", getApiEndpointsForModule(sub.getAppCode()));
            myApps.add(appInfo);
        }

        return myApps;
    }

    /**
     * 判断订阅是否有效（未过期且状态为 ACTIVE 或 TRIAL）
     */
    private boolean isSubscriptionActive(TenantSubscription sub) {
        if (sub.getEndTime() != null && sub.getEndTime().isBefore(LocalDateTime.now())) {
            return false; // 已过期
        }
        String status = sub.getStatus();
        return "ACTIVE".equals(status) || "TRIAL".equals(status);
    }

    /**
     * 获取某个模块包含的所有API端点信息
     */
    public List<Map<String, String>> getApiEndpointsForModule(String appCode) {
        List<Map<String, String>> endpoints = new ArrayList<>();
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
            case "CRM_MODULE":
            case "FINANCE_TAX":
            case "PROCUREMENT":
                // UI功能模块 — 订阅后解锁系统内功能页面，无外部API端点
                break;
            default:
                break;
        }
        return endpoints;
    }

    /**
     * 计算价格
     */
    public BigDecimal calculatePrice(AppStore app, String subscriptionType) {
        switch (subscriptionType) {
            case "TRIAL": return BigDecimal.ZERO;
            case "MONTHLY": return app.getPriceMonthly() != null ? app.getPriceMonthly() : BigDecimal.ZERO;
            case "YEARLY": return app.getPriceYearly() != null ? app.getPriceYearly() : BigDecimal.ZERO;
            case "PERPETUAL": return app.getPriceOnce() != null ? app.getPriceOnce() : BigDecimal.ZERO;
            default: return BigDecimal.ZERO;
        }
    }
}
