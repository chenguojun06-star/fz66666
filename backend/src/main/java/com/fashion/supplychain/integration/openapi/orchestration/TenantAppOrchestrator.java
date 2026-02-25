package com.fashion.supplychain.integration.openapi.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.integration.openapi.dto.TenantAppRequest;
import com.fashion.supplychain.integration.openapi.dto.TenantAppResponse;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.integration.openapi.entity.TenantAppLog;
import com.fashion.supplychain.integration.openapi.service.TenantAppLogService;
import com.fashion.supplychain.integration.openapi.service.TenantAppService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 客户应用管理编排器
 * 负责：应用CRUD、密钥管理、Webhook推送、调用日志、配额控制
 */
@Service
public class TenantAppOrchestrator {

    private static final Map<String, String> APP_TYPE_NAMES = Map.of(
        "ORDER_SYNC", "下单对接",
        "QUALITY_FEEDBACK", "质检反馈",
        "LOGISTICS_SYNC", "物流对接",
        "PAYMENT_SYNC", "付款对接",
        "MATERIAL_SUPPLY", "面辅料供应对接",
        "DATA_IMPORT", "数据导入（开通即用）"
    );

    private static final Map<String, String> STATUS_NAMES = Map.of(
        "active", "启用",
        "disabled", "停用",
        "expired", "已过期"
    );

    @Autowired
    private TenantAppService tenantAppService;

    @Autowired
    private TenantAppLogService tenantAppLogService;

    // ========== 应用管理 ==========

    /**
     * 创建应用（返回包含明文 appSecret 的响应，仅此一次）
     */
    @Transactional(rollbackFor = Exception.class)
    public TenantAppResponse createApp(Long tenantId, TenantAppRequest request) {
        // 校验应用类型
        if (!APP_TYPE_NAMES.containsKey(request.getAppType())) {
            throw new IllegalArgumentException("不支持的应用类型: " + request.getAppType());
        }

        TenantApp app = new TenantApp();
        app.setTenantId(tenantId);
        app.setAppName(request.getAppName());
        app.setAppType(request.getAppType());
        app.setStatus("active");
        app.setCallbackUrl(request.getCallbackUrl());
        app.setExternalApiUrl(request.getExternalApiUrl());
        app.setConfigJson(request.getConfigJson());
        app.setDailyQuota(request.getDailyQuota() != null ? request.getDailyQuota() : 0);
        app.setDailyUsed(0);
        app.setTotalCalls(0L);
        app.setRemark(request.getRemark());
        app.setDeleteFlag(0);
        app.setCreatedBy(String.valueOf(tenantId));

        // 生成密钥对
        String appKey = generateAppKey(request.getAppType());
        String rawSecret = generateSecret(32);
        String callbackSecret = generateSecret(16);

        app.setAppKey(appKey);
        app.setAppSecret(rawSecret); // 实际生产环境应加密存储
        app.setCallbackSecret(callbackSecret);

        // 解析过期时间
        if (StringUtils.hasText(request.getExpireTime())) {
            app.setExpireTime(LocalDateTime.parse(request.getExpireTime(), DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        }

        tenantAppService.save(app);

        // 返回含明文密钥的响应
        TenantAppResponse resp = toResponse(app);
        resp.setAppSecret(rawSecret); // 明文，仅创建时返回
        return resp;
    }

    /**
     * 查询应用列表
     */
    public Page<TenantAppResponse> listApps(Long tenantId, String appType, String status, int page, int size) {
        LambdaQueryWrapper<TenantApp> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantApp::getTenantId, tenantId);
        if (StringUtils.hasText(appType)) {
            wrapper.eq(TenantApp::getAppType, appType);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(TenantApp::getStatus, status);
        }
        wrapper.orderByDesc(TenantApp::getCreateTime);

        Page<TenantApp> pageResult = tenantAppService.page(new Page<>(page, size), wrapper);

        Page<TenantAppResponse> responsePage = new Page<>(pageResult.getCurrent(), pageResult.getSize(), pageResult.getTotal());
        responsePage.setRecords(pageResult.getRecords().stream().map(this::toResponse).collect(Collectors.toList()));
        return responsePage;
    }

    /**
     * 超级管理员：查询所有租户应用
     */
    public Page<TenantAppResponse> listAllApps(String appType, String status, int page, int size) {
        LambdaQueryWrapper<TenantApp> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(appType)) {
            wrapper.eq(TenantApp::getAppType, appType);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(TenantApp::getStatus, status);
        }
        wrapper.orderByDesc(TenantApp::getCreateTime);

        Page<TenantApp> pageResult = tenantAppService.page(new Page<>(page, size), wrapper);
        Page<TenantAppResponse> responsePage = new Page<>(pageResult.getCurrent(), pageResult.getSize(), pageResult.getTotal());
        responsePage.setRecords(pageResult.getRecords().stream().map(this::toResponse).collect(Collectors.toList()));
        return responsePage;
    }

    /**
     * 获取应用详情
     */
    public TenantAppResponse getAppDetail(String appId, Long tenantId) {
        TenantApp app = tenantAppService.getById(appId);
        if (app == null || !app.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("应用不存在");
        }
        return toResponse(app);
    }

    /**
     * 更新应用配置
     */
    @Transactional(rollbackFor = Exception.class)
    public TenantAppResponse updateApp(String appId, Long tenantId, TenantAppRequest request) {
        TenantApp app = tenantAppService.getById(appId);
        if (app == null || !app.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("应用不存在");
        }

        if (StringUtils.hasText(request.getAppName())) {
            app.setAppName(request.getAppName());
        }
        if (StringUtils.hasText(request.getCallbackUrl())) {
            app.setCallbackUrl(request.getCallbackUrl());
        }
        if (StringUtils.hasText(request.getExternalApiUrl())) {
            app.setExternalApiUrl(request.getExternalApiUrl());
        }
        if (request.getDailyQuota() != null) {
            app.setDailyQuota(request.getDailyQuota());
        }
        if (StringUtils.hasText(request.getConfigJson())) {
            app.setConfigJson(request.getConfigJson());
        }
        if (StringUtils.hasText(request.getRemark())) {
            app.setRemark(request.getRemark());
        }
        if (StringUtils.hasText(request.getExpireTime())) {
            app.setExpireTime(LocalDateTime.parse(request.getExpireTime(), DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        }

        tenantAppService.updateById(app);
        return toResponse(app);
    }

    /**
     * 切换应用状态
     */
    @Transactional(rollbackFor = Exception.class)
    public TenantAppResponse toggleStatus(String appId, Long tenantId) {
        TenantApp app = tenantAppService.getById(appId);
        if (app == null || !app.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("应用不存在");
        }
        app.setStatus("active".equals(app.getStatus()) ? "disabled" : "active");
        tenantAppService.updateById(app);
        return toResponse(app);
    }

    /**
     * 重置密钥（返回新的明文密钥，仅此一次）
     */
    @Transactional(rollbackFor = Exception.class)
    public TenantAppResponse resetSecret(String appId, Long tenantId) {
        TenantApp app = tenantAppService.getById(appId);
        if (app == null || !app.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("应用不存在");
        }

        String newSecret = generateSecret(32);
        String newCallbackSecret = generateSecret(16);
        app.setAppSecret(newSecret);
        app.setCallbackSecret(newCallbackSecret);
        tenantAppService.updateById(app);

        TenantAppResponse resp = toResponse(app);
        resp.setAppSecret(newSecret); // 明文返回
        resp.setCallbackSecret(newCallbackSecret);
        return resp;
    }

    /**
     * 删除应用
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteApp(String appId, Long tenantId) {
        TenantApp app = tenantAppService.getById(appId);
        if (app == null || !app.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("应用不存在");
        }
        tenantAppService.removeById(appId);
    }

    // ========== 开放API鉴权 ==========

    /**
     * 通过 appKey 验证并获取应用信息（用于开放API网关鉴权）
     */
    public TenantApp authenticateByAppKey(String appKey, String signature, String timestamp, String body) {
        LambdaQueryWrapper<TenantApp> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantApp::getAppKey, appKey);
        wrapper.eq(TenantApp::getDeleteFlag, 0);
        TenantApp app = tenantAppService.getOne(wrapper);

        if (app == null) {
            throw new SecurityException("无效的 appKey");
        }
        if (!"active".equals(app.getStatus())) {
            throw new SecurityException("应用已停用");
        }
        if (app.getExpireTime() != null && app.getExpireTime().isBefore(LocalDateTime.now())) {
            throw new SecurityException("应用已过期");
        }

        // 验证签名: HMAC-SHA256(appSecret, timestamp + body)
        String expectedSignature = hmacSha256(app.getAppSecret(), timestamp + (body != null ? body : ""));
        if (!expectedSignature.equals(signature)) {
            throw new SecurityException("签名验证失败");
        }

        // 检查配额
        checkAndIncrementQuota(app);

        return app;
    }

    // ========== 调用日志 ==========

    /**
     * 记录API调用日志
     */
    public void logApiCall(String appId, Long tenantId, String appType, String direction,
                           String method, String path, String requestBody,
                           int responseCode, String responseBody, long costMs,
                           String result, String errorMessage, String clientIp) {
        TenantAppLog log = new TenantAppLog();
        log.setAppId(appId);
        log.setTenantId(tenantId);
        log.setAppType(appType);
        log.setDirection(direction);
        log.setHttpMethod(method);
        log.setRequestPath(path);
        log.setRequestBody(truncate(requestBody, 2000));
        log.setResponseCode(responseCode);
        log.setResponseBody(truncate(responseBody, 2000));
        log.setCostMs(costMs);
        log.setResult(result);
        log.setErrorMessage(truncate(errorMessage, 500));
        log.setClientIp(clientIp);
        tenantAppLogService.save(log);
    }

    /**
     * 查询调用日志
     */
    public Page<TenantAppLog> listLogs(String appId, Long tenantId, int page, int size) {
        LambdaQueryWrapper<TenantAppLog> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(appId)) {
            wrapper.eq(TenantAppLog::getAppId, appId);
        }
        if (tenantId != null) {
            wrapper.eq(TenantAppLog::getTenantId, tenantId);
        }
        wrapper.orderByDesc(TenantAppLog::getCreateTime);
        return tenantAppLogService.page(new Page<>(page, size), wrapper);
    }

    // ========== 统计 ==========

    /**
     * 获取应用类型列表（前端下拉选项）
     */
    public List<Map<String, String>> getAppTypes() {
        return APP_TYPE_NAMES.entrySet().stream()
            .map(e -> Map.of("value", e.getKey(), "label", e.getValue()))
            .collect(Collectors.toList());
    }

    /**
     * 获取租户应用统计
     */
    public Map<String, Object> getStats(Long tenantId) {
        LambdaQueryWrapper<TenantApp> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantApp::getTenantId, tenantId);
        List<TenantApp> apps = tenantAppService.list(wrapper);

        Map<String, Object> stats = new HashMap<>();
        stats.put("total", apps.size());
        stats.put("active", apps.stream().filter(a -> "active".equals(a.getStatus())).count());
        stats.put("disabled", apps.stream().filter(a -> "disabled".equals(a.getStatus())).count());
        stats.put("totalCalls", apps.stream().mapToLong(a -> a.getTotalCalls() != null ? a.getTotalCalls() : 0).sum());
        stats.put("byType", apps.stream().collect(Collectors.groupingBy(TenantApp::getAppType, Collectors.counting())));
        return stats;
    }

    /**
     * 集成总览 — 返回4大模块的对接状态和最近活动
     * 在【客户应用管理】页面展示全局对接概览
     */
    public Map<String, Object> getIntegrationOverview(Long tenantId) {
        Map<String, Object> overview = new LinkedHashMap<>();

        // 获取所有应用
        LambdaQueryWrapper<TenantApp> appWrapper = new LambdaQueryWrapper<>();
        appWrapper.eq(TenantApp::getTenantId, tenantId);
        List<TenantApp> apps = tenantAppService.list(appWrapper);

        // 5大模块摘要
        String[] types = {"ORDER_SYNC", "QUALITY_FEEDBACK", "LOGISTICS_SYNC", "PAYMENT_SYNC", "MATERIAL_SUPPLY"};
        String[] typeNames = {"下单对接", "质检反馈", "物流对接", "付款对接", "面辅料供应对接"};
        String[] viewPages = {
            "生产管理 → 我的订单",
            "生产管理 → 质检入库",
            "仓库管理 → 成品进销存",
            "财务管理 → 订单结算",
            "仓库管理 → 面辅料库存"
        };
        String[] viewPaths = {"/production", "/production/warehousing", "/warehouse/finished", "/finance/center", "/warehouse/material"};

        List<Map<String, Object>> modules = new ArrayList<>();
        for (int i = 0; i < types.length; i++) {
            String type = types[i];
            Map<String, Object> module = new LinkedHashMap<>();
            module.put("appType", type);
            module.put("appTypeName", typeNames[i]);
            module.put("viewPage", viewPages[i]);
            module.put("viewPath", viewPaths[i]);

            // 该类型下的活跃应用数
            long activeCount = apps.stream()
                .filter(a -> type.equals(a.getAppType()) && "active".equals(a.getStatus()))
                .count();
            module.put("activeApps", activeCount);
            module.put("connected", activeCount > 0);

            // 该类型总调用量
            long totalCalls = apps.stream()
                .filter(a -> type.equals(a.getAppType()))
                .mapToLong(a -> a.getTotalCalls() != null ? a.getTotalCalls() : 0)
                .sum();
            module.put("totalCalls", totalCalls);

            // 最近一次调用时间
            Optional<LocalDateTime> lastCall = apps.stream()
                .filter(a -> type.equals(a.getAppType()) && a.getLastCallTime() != null)
                .map(TenantApp::getLastCallTime)
                .max(LocalDateTime::compareTo);
            module.put("lastCallTime", lastCall.orElse(null));

            modules.add(module);
        }
        overview.put("modules", modules);

        // 全局统计
        overview.put("totalApps", apps.size());
        overview.put("activeApps", apps.stream().filter(a -> "active".equals(a.getStatus())).count());
        overview.put("totalCalls", apps.stream().mapToLong(a -> a.getTotalCalls() != null ? a.getTotalCalls() : 0).sum());

        // 最近10条调用日志
        Page<TenantAppLog> recentLogs = listLogs(null, tenantId, 1, 10);
        overview.put("recentLogs", recentLogs.getRecords());

        return overview;
    }

    // ========== 私有方法 ==========

    private TenantAppResponse toResponse(TenantApp app) {
        TenantAppResponse resp = new TenantAppResponse();
        resp.setId(app.getId());
        resp.setTenantId(app.getTenantId());
        resp.setAppName(app.getAppName());
        resp.setAppType(app.getAppType());
        resp.setAppTypeName(APP_TYPE_NAMES.getOrDefault(app.getAppType(), app.getAppType()));
        resp.setAppKey(app.getAppKey());
        resp.setAppSecret("****"); // 默认脱敏
        resp.setStatus(app.getStatus());
        resp.setStatusName(STATUS_NAMES.getOrDefault(app.getStatus(), app.getStatus()));
        resp.setCallbackUrl(app.getCallbackUrl());
        resp.setCallbackSecret(app.getCallbackSecret());
        resp.setExternalApiUrl(app.getExternalApiUrl());
        resp.setConfigJson(app.getConfigJson());
        resp.setDailyQuota(app.getDailyQuota());
        resp.setDailyUsed(app.getDailyUsed());
        resp.setTotalCalls(app.getTotalCalls());
        resp.setLastCallTime(app.getLastCallTime());
        resp.setExpireTime(app.getExpireTime());
        resp.setCreateTime(app.getCreateTime());
        resp.setRemark(app.getRemark());

        // 生成示例代码片段
        resp.setExampleSnippet(generateExampleSnippet(app));
        return resp;
    }

    private String generateExampleSnippet(TenantApp app) {
        String baseUrl = "https://your-domain.com/openapi/v1";
        switch (app.getAppType()) {
            case "ORDER_SYNC":
                return String.format(
                    "curl -X POST %s/order/create \\\n" +
                    "  -H 'X-App-Key: %s' \\\n" +
                    "  -H 'X-Timestamp: $(date +%%s)' \\\n" +
                    "  -H 'X-Signature: <HMAC-SHA256>' \\\n" +
                    "  -H 'Content-Type: application/json' \\\n" +
                    "  -d '{\n" +
                    "    \"styleNo\": \"FZ2024001\",\n" +
                    "    \"quantity\": 500,\n" +
                    "    \"colors\": [\"红\", \"蓝\"],\n" +
                    "    \"sizes\": [\"S\", \"M\", \"L\"],\n" +
                    "    \"company\": \"客户品牌名\",\n" +
                    "    \"merchandiser\": \"跟单员姓名\",\n" +
                    "    \"patternMaker\": \"纸样师姓名\",\n" +
                    "    \"factoryName\": \"加工厂名称\",\n" +
                    "    \"expectedShipDate\": \"2026-03-15\",\n" +
                    "    \"plannedStartDate\": \"2026-03-01\",\n" +
                    "    \"plannedEndDate\": \"2026-03-14\",\n" +
                    "    \"processUnitPrices\": [\n" +
                    "      {\"processName\": \"裁剪\", \"processCode\": \"CUT\", \"unitPrice\": 0.5},\n" +
                    "      {\"processName\": \"车缝\", \"processCode\": \"SEW\", \"unitPrice\": 2.0},\n" +
                    "      {\"processName\": \"质检\", \"processCode\": \"QC\",  \"unitPrice\": 0.3}\n" +
                    "    ],\n" +
                    "    \"remarks\": \"加急订单\"\n" +
                    "  }'\n\n" +
                    "# 提示：不传 processUnitPrices 时，系统自动从款式工序配置带入单价",
                    baseUrl, app.getAppKey());
            case "QUALITY_FEEDBACK":
                return String.format(
                    "# 我们会向您的回调地址推送质检结果：\n" +
                    "POST %s\n" +
                    "{\n  \"event\": \"quality.inspected\",\n  \"orderNo\": \"PO20260201001\",\n" +
                    "  \"qualified\": 480,\n  \"unqualified\": 20,\n  \"defects\": [{\"category\":\"色差\",\"qty\":15}]\n}",
                    app.getCallbackUrl() != null ? app.getCallbackUrl() : "<您的回调URL>");
            case "LOGISTICS_SYNC":
                return String.format(
                    "# 出库时自动推送物流信息到您的系统：\n" +
                    "POST %s\n" +
                    "{\n  \"event\": \"shipment.created\",\n  \"orderNo\": \"PO20260201001\",\n" +
                    "  \"outstockNo\": \"OUT20260201001\",\n  \"quantity\": 480,\n  \"warehouse\": \"A仓\"\n}",
                    app.getCallbackUrl() != null ? app.getCallbackUrl() : "<您的回调URL>");
            case "PAYMENT_SYNC":
                return String.format(
                    "# 查询待付款对账单：\n" +
                    "curl -X GET %s/payment/pending \\\n" +
                    "  -H 'X-App-Key: %s' \\\n" +
                    "  -H 'X-Timestamp: $(date +%%s)' \\\n" +
                    "  -H 'X-Signature: <HMAC-SHA256>'\n\n" +
                    "# 确认付款：\n" +
                    "curl -X POST %s/payment/confirm \\\n" +
                    "  -d '{\"reconciliationId\":\"xxx\",\"paymentMethod\":\"bank_transfer\",\"paymentRef\":\"TXN123\"}'",
                    baseUrl, app.getAppKey(), baseUrl);            case "MATERIAL_SUPPLY":
                return String.format(
                    "# 推送采购订单到供应商：\n" +
                    "curl -X POST %s/material/purchase-order \\\n" +
                    "  -H 'X-App-Key: %s' \\\n" +
                    "  -H 'X-Timestamp: $(date +%%s)' \\\n" +
                    "  -H 'X-Signature: <HMAC-SHA256>' \\\n" +
                    "  -H 'Content-Type: application/json' \\\n" +
                    "  -d '{\"materialCode\":\"F001\",\"materialName\":\"涤纶面料\",\"quantity\":500,\"unit\":\"米\"}'" ,
                    baseUrl, app.getAppKey());            default:
                return "";
        }
    }

    private void checkAndIncrementQuota(TenantApp app) {
        // 重置每日配额
        if (app.getLastQuotaResetTime() == null ||
            app.getLastQuotaResetTime().toLocalDate().isBefore(LocalDateTime.now().toLocalDate())) {
            app.setDailyUsed(0);
            app.setLastQuotaResetTime(LocalDateTime.now());
        }

        // 检查限额
        if (app.getDailyQuota() != null && app.getDailyQuota() > 0 && app.getDailyUsed() >= app.getDailyQuota()) {
            throw new SecurityException("今日调用次数已达上限(" + app.getDailyQuota() + ")");
        }

        // 递增计数
        app.setDailyUsed((app.getDailyUsed() != null ? app.getDailyUsed() : 0) + 1);
        app.setTotalCalls((app.getTotalCalls() != null ? app.getTotalCalls() : 0) + 1);
        app.setLastCallTime(LocalDateTime.now());
        tenantAppService.updateById(app);
    }

    private String generateAppKey(String appType) {
        String prefix;
        switch (appType) {
            case "ORDER_SYNC": prefix = "ord"; break;
            case "QUALITY_FEEDBACK": prefix = "qc"; break;
            case "LOGISTICS_SYNC": prefix = "lgs"; break;
            case "PAYMENT_SYNC": prefix = "pay"; break;
            case "MATERIAL_SUPPLY": prefix = "mat"; break;
            default: prefix = "app"; break;
        }
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 24);
    }

    private String generateSecret(int length) {
        SecureRandom random = new SecureRandom();
        byte[] bytes = new byte[length];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).substring(0, length);
    }

    private String hmacSha256(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] result = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : result) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("签名计算失败", e);
        }
    }

    private String truncate(String str, int maxLen) {
        if (str == null) return null;
        return str.length() > maxLen ? str.substring(0, maxLen) : str;
    }
}
