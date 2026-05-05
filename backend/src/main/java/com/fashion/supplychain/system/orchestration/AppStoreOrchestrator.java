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
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.TenantSubscriptionService;
import com.fashion.supplychain.system.entity.TenantSubscription;

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
            try {
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
            } finally {
                conn.disconnect();
            }
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
        Long tid = tenantId != null ? tenantId : 0L;

        QueryWrapper<AppOrder> dupWrapper = new QueryWrapper<>();
        dupWrapper.eq("tenant_id", tid);
        dupWrapper.eq("app_id", app.getId());
        dupWrapper.eq("subscription_type", subscriptionType);
        dupWrapper.eq("status", "PENDING");
        long pendingCount = appOrderService.count(dupWrapper);
        if (pendingCount > 0) {
            throw new RuntimeException("您已有一个待处理的相同订单，请等待商务团队联系或联系客服取消后重新提交");
        }

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

        log.info("[应用订单通知] 租户={} 应用={} 订单号={}（全局广播已移除）", order.getTenantName(), app.getAppName(), order.getOrderNo());

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
        appStoreService.fixMojibakeFields(app);

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

        log.info("[试用通知] 租户={} 应用={}（全局广播已移除）", trialOrder.getTenantName(), app.getAppName());

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
        appStoreService.fixMojibakeFields(app);

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
            List<AppStore> allApps = appStoreService.lambdaQuery().last("LIMIT 500").list();
            List<Map<String, Object>> result = new ArrayList<>();
            for (AppStore app : allApps) {
                appStoreService.fixMojibakeFields(app);
                Map<String, Object> appInfo = new LinkedHashMap<>();
                appInfo.put("appCode", app.getAppCode());
                appInfo.put("appName", app.getAppName());
                appInfo.put("subscriptionType", "PERMANENT");
                appInfo.put("price", BigDecimal.ZERO);
                appInfo.put("priceMonthly", app.getPriceMonthly());
                appInfo.put("priceYearly", app.getPriceYearly());
                appInfo.put("priceOnce", app.getPriceOnce());
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
            appInfo.put("price", sub.getPrice());
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

    /**
     * 【超管】直接为指定租户开通应用模块（无需下单/支付）
     * 支持应用商店中所有 PUBLISHED 状态的应用：
     * - UI 功能模块（CRM_MODULE/FINANCE_TAX/PROCUREMENT）：仅创建订阅，无需 API 凭证
     * - API 对接模块（ORDER_SYNC/EC_* 等）：创建订阅 + 自动创建 TenantApp API 凭证
     * 使用 JdbcTemplate 绕开 MyBatis-Plus 租户拦截器
     *
     * @param targetTenantId 目标租户 ID
     * @param appCodes       应用编码列表，如 ["CRM_MODULE","ORDER_SYNC","EC_TAOBAO"]
     * @param durationMonths 有效期（月）；<=0 表示永久（99年）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> adminGrantToTenant(Long targetTenantId, List<String> appCodes, int durationMonths) {
        if (targetTenantId == null || appCodes == null || appCodes.isEmpty()) {
            throw new RuntimeException("参数不完整：租户 ID 和应用码不能为空");
        }

        java.util.Set<String> UI_MODULE_TYPES = java.util.Set.of("CRM_MODULE", "FINANCE_TAX", "PROCUREMENT");

        List<String> activated = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        Map<String, Map<String, String>> apiCredentialsMap = new java.util.LinkedHashMap<>();

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime endTime = durationMonths <= 0 ? now.plusYears(99) : now.plusMonths(durationMonths);
        String tenantName = resolveTenantName(targetTenantId);
        UserContext ctx = UserContext.get();
        String operator = ctx != null ? ctx.getUsername() : "super_admin";

        for (String appCode : appCodes) {
            try {
                List<Map<String, Object>> appRows = jdbcTemplate.queryForList(
                    "SELECT id, app_code, app_name FROM t_app_store WHERE app_code = ? AND status = 'PUBLISHED' LIMIT 1",
                    appCode);
                if (appRows.isEmpty()) {
                    failed.add(appCode + "(应用商店中不存在或未发布)");
                    continue;
                }
                Long appId = ((Number) appRows.get(0).get("id")).longValue();
                String appName = (String) appRows.get(0).get("app_name");
                appName = fixMojibakeString(appName);

                List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                    "SELECT id FROM t_tenant_subscription WHERE tenant_id = ? AND app_code = ? AND status IN ('ACTIVE','TRIAL') LIMIT 1",
                    targetTenantId, appCode);

                if (!existing.isEmpty()) {
                    long subId = ((Number) existing.get(0).get("id")).longValue();
                    jdbcTemplate.update(
                        "UPDATE t_tenant_subscription SET status='ACTIVE', end_time=?, " +
                        "remark=CONCAT(IFNULL(remark,''),' | 超管续期:',?), update_time=? WHERE id=?",
                        endTime, operator, now, subId);
                    log.info("[超管直接开通] 租户{}({}) 续期 appCode={} 到期={}", tenantName, targetTenantId, appCode, endTime);
                } else {
                    String subNo = tenantSubscriptionService.generateSubscriptionNo();
                    jdbcTemplate.update(
                        "INSERT INTO t_tenant_subscription (subscription_no, tenant_id, tenant_name, app_id, app_code, app_name, " +
                        "subscription_type, price, user_count, start_time, end_time, status, auto_renew, created_by, remark, create_time, delete_flag) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        subNo, targetTenantId, tenantName, appId, appCode, appName,
                        "PERPETUAL", 0, 999, now, endTime, "ACTIVE", false, operator, "超管直接开通", now, 0);
                    log.info("[超管直接开通] 租户{}({}) 新建订阅 appCode={} 到期={}", tenantName, targetTenantId, appCode, endTime);
                }

                boolean needsApiCredential = !UI_MODULE_TYPES.contains(appCode);
                if (needsApiCredential) {
                    try {
                        List<Map<String, Object>> existingApp = jdbcTemplate.queryForList(
                            "SELECT id FROM t_tenant_app WHERE tenant_id = ? AND app_type = ? AND delete_flag = 0 LIMIT 1",
                            targetTenantId, appCode);
                        if (existingApp.isEmpty()) {
                            TenantAppRequest appRequest = new TenantAppRequest();
                            appRequest.setAppName(appName);
                            appRequest.setAppType(appCode);
                            appRequest.setDailyQuota(10000);
                            appRequest.setRemark("超管直接开通 - " + operator);
                            appRequest.setExpireTime(endTime.toString());
                            TenantAppResponse appCredentials = tenantAppOrchestrator.createApp(targetTenantId, appRequest);
                            apiCredentialsMap.put(appCode, Map.of(
                                "appKey", appCredentials.getAppKey(),
                                "appSecret", appCredentials.getAppSecret(),
                                "appId", appCredentials.getId()
                            ));
                            log.info("[超管直接开通] 自动创建API凭证: appCode={} appKey={}", appCode, appCredentials.getAppKey());
                        } else {
                            log.info("[超管直接开通] 租户{}已有API凭证 appCode={}，跳过创建", targetTenantId, appCode);
                        }
                    } catch (Exception ex) {
                        log.warn("[超管直接开通] API凭证创建失败 appCode={}，订阅已创建但凭证缺失: {}", appCode, ex.getMessage());
                        failed.add(appCode + "(订阅已创建，但API凭证创建失败: " + ex.getMessage() + ")");
                        activated.add(appCode);
                        continue;
                    }
                }

                activated.add(appCode);
            } catch (Exception e) {
                log.error("[超管直接开通] 租户{} 开通 {} 失败: {}", targetTenantId, appCode, e.getMessage(), e);
                failed.add(appCode + "(" + e.getMessage() + ")");
            }
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("tenantName", tenantName);
        result.put("activated", activated);
        result.put("failed", failed);
        result.put("endTime", endTime.toString());
        if (!apiCredentialsMap.isEmpty()) {
            result.put("apiCredentials", apiCredentialsMap);
        }
        return result;
    }

    /**
     * 【超管】撤销租户的应用权限
     * 将订阅状态设为 EXPIRED，同时停用对应的 TenantApp API 凭证
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> adminRevokeFromTenant(Long targetTenantId, List<String> appCodes) {
        if (targetTenantId == null || appCodes == null || appCodes.isEmpty()) {
            throw new RuntimeException("参数不完整：租户 ID 和应用码不能为空");
        }

        List<String> revoked = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        String tenantName = resolveTenantName(targetTenantId);
        UserContext ctx = UserContext.get();
        String operator = ctx != null ? ctx.getUsername() : "super_admin";
        LocalDateTime now = LocalDateTime.now();

        for (String appCode : appCodes) {
            try {
                int updated = jdbcTemplate.update(
                    "UPDATE t_tenant_subscription SET status='EXPIRED', " +
                    "remark=CONCAT(IFNULL(remark,''),' | 超管撤销:',?), update_time=? " +
                    "WHERE tenant_id=? AND app_code=? AND status IN ('ACTIVE','TRIAL') AND delete_flag=0",
                    operator, now, targetTenantId, appCode);

                jdbcTemplate.update(
                    "UPDATE t_tenant_app SET status='disabled', update_time=? " +
                    "WHERE tenant_id=? AND app_type=? AND delete_flag=0",
                    now, targetTenantId, appCode);

                if (updated > 0) {
                    log.info("[超管撤销] 租户{}({}) 撤销 appCode={}", tenantName, targetTenantId, appCode);
                    revoked.add(appCode);
                } else {
                    failed.add(appCode + "(无有效订阅可撤销)");
                }
            } catch (Exception e) {
                log.error("[超管撤销] 租户{} 撤销 {} 失败: {}", targetTenantId, appCode, e.getMessage(), e);
                failed.add(appCode + "(" + e.getMessage() + ")");
            }
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("tenantName", tenantName);
        result.put("revoked", revoked);
        result.put("failed", failed);
        return result;
    }

    /**
     * 【超管】查询指定租户的所有订阅（含已过期），用于超管管理页面展示
     */
    public List<Map<String, Object>> adminGetTenantSubscriptions(Long targetTenantId) {
        if (targetTenantId == null) {
            throw new RuntimeException("租户 ID 不能为空");
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT id, subscription_no, app_code, app_name, subscription_type, " +
            "price, user_count, start_time, end_time, status, remark, create_time " +
            "FROM t_tenant_subscription WHERE tenant_id = ? AND delete_flag = 0 ORDER BY create_time DESC",
            targetTenantId);
        for (Map<String, Object> row : rows) {
            if (row.get("app_name") instanceof String) {
                row.put("app_name", fixMojibakeString((String) row.get("app_name")));
            }
        }
        return rows;
    }

    @Transactional(rollbackFor = Exception.class)
    public void cancelOrder(String orderNo, Long tenantId) {
        QueryWrapper<AppOrder> wrapper = new QueryWrapper<>();
        wrapper.eq("order_no", orderNo);
        if (!UserContext.isSuperAdmin()) {
            wrapper.eq("tenant_id", tenantId);
        }
        wrapper.ne("status", "PAID")
               .ne("status", "ACTIVATED")
               .ne("status", "CANCELLED");
        AppOrder order = appOrderService.getOne(wrapper);
        if (order == null) {
            throw new RuntimeException("订单不存在或不可取消");
        }
        order.setStatus("CANCELLED");
        order.setRemark("用户主动取消");
        appOrderService.updateById(order);
        log.info("[应用订单] 取消订单: orderNo={} tenant={}", orderNo, tenantId);
    }

    @Transactional(rollbackFor = Exception.class)
    public AppOrder renewSubscription(Long subscriptionId, Long tenantId, String subscriptionType) {
        TenantSubscription sub = tenantSubscriptionService.getById(subscriptionId);
        if (sub == null || !sub.getTenantId().equals(tenantId)) {
            throw new RuntimeException("订阅记录不存在");
        }

        AppStore app = appStoreService.getById(sub.getAppId());
        if (app == null) {
            throw new RuntimeException("关联应用已下架");
        }

        AppOrder order = createOrder(app, tenantId, subscriptionType,
                sub.getUserCount(), null, null, null, null,
                false, null, null);
        order.setOrderType("RENEW");
        appOrderService.updateById(order);

        log.info("[应用订单] 续费创建: orderNo={} subscriptionId={}", order.getOrderNo(), subscriptionId);
        return order;
    }

    private String fixMojibakeString(String text) {
        if (text == null || text.isEmpty()) return text;
        boolean hasLatin1Ext = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= '\u00c0' && c <= '\u00ff') {
                hasLatin1Ext = true;
                break;
            }
        }
        if (!hasLatin1Ext) return text;
        try {
            return new String(text.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            return text;
        }
    }
}
